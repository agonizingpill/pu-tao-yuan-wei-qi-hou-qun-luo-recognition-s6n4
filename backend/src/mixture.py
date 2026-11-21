import numpy as np
from sklearn.mixture import GaussianMixture
from sklearn.preprocessing import StandardScaler

from .domain import Profile

SEED = 1071
REG_COVAR = 0.025
FEATURES = ('day_temp', 'night_temp', 'day_rh', 'night_rh')


def feature_matrix(snapshot):
    return np.array([[np.mean([r['temp_c'] for r in item['readings'] if r['slot'] == 'day']),
                      np.mean([r['temp_c'] for r in item['readings'] if r['slot'] == 'night']),
                      np.mean([r['rh_pct'] for r in item['readings'] if r['slot'] == 'day']),
                      np.mean([r['rh_pct'] for r in item['readings'] if r['slot'] == 'night'])]
                     for item in snapshot])


def fit_profiles(snapshot):
    features = feature_matrix(snapshot)
    scaler = StandardScaler().fit(features)
    matrix = scaler.transform(features)
    if len(np.unique(matrix, axis=0)) < 2:
        raise ValueError('采样特征无差异，无法识别微气候群落。')
    counts = range(1, min(3, len(np.unique(matrix, axis=0))) + 1)
    candidates = [GaussianMixture(n_components=k, covariance_type='diag', reg_covar=REG_COVAR,
                                  n_init=10, random_state=SEED).fit(matrix) for k in counts]
    scores = {str(m.n_components): float(m.bic(matrix)) for m in candidates if m.converged_}
    if not scores:
        raise ValueError('全部候选组数未收敛。')
    model = min((m for m in candidates if m.converged_), key=lambda m: scores[str(m.n_components)])
    centroids = scaler.inverse_transform(model.means_)
    # Order by warm/dry tendency rather than arbitrary mixture component indices.
    order = np.argsort(model.means_ @ np.array([1, 1, -1, -1]), kind='stable')
    profile_order = {1: [Profile.BALANCED], 2: [Profile.COOL, Profile.WARM],
                     3: [Profile.COOL, Profile.BALANCED, Profile.WARM]}[model.n_components]
    names = dict(zip(order, profile_order))
    posterior = model.predict_proba(matrix)
    return {
        'chosen_k': model.n_components, 'bic': scores, 'seed': SEED,
        'covariance_type': 'diag', 'reg_covar': REG_COVAR, 'n_init': 10, 'features': FEATURES,
        'centroids': {names[i]: dict(zip(FEATURES, row.tolist())) for i, row in enumerate(centroids)},
        'assignments': [dict(block_id=item['block_id'], code=item['code'],
                             profile=names[int(np.argmax(p))], confidence=float(max(p)))
                        for item, p in zip(snapshot, posterior)],
        # 完整模型参数随批次留存，供试种地在不参与拟合的前提下复用已生效模型判群。
        'model': {
            'scaler_mean': scaler.mean_.tolist(),
            'scaler_scale': scaler.scale_.tolist(),
            'weights': model.weights_.tolist(),
            'means': model.means_.tolist(),
            'covariances': model.covariances_.tolist(),
            'component_profiles': [str(names[i]) for i in range(model.n_components)],
        },
    }


def assign_with_model(bundle, snapshot):
    """Apply a persisted effective model to trial-block readings without refitting."""
    mean = np.array(bundle['scaler_mean'])
    scale = np.array(bundle['scaler_scale'])
    weights = np.array(bundle['weights'])
    means = np.array(bundle['means'])
    covariances = np.array(bundle['covariances'])
    profiles = bundle['component_profiles']
    matrix = (feature_matrix(snapshot) - mean) / scale
    # Diagonal-covariance Gaussian responsibilities, matching GaussianMixture's E-step.
    log_prob = (-0.5 * np.sum(np.log(2 * np.pi * covariances), axis=1)
                - 0.5 * np.sum(((matrix[:, None, :] - means[None, :, :]) ** 2) / covariances, axis=2))
    weighted = np.log(weights)[None, :] + log_prob
    posterior = np.exp(weighted - weighted.max(axis=1, keepdims=True))
    posterior /= posterior.sum(axis=1, keepdims=True)
    centroids = means * scale + mean
    return {
        'chosen_k': len(profiles),
        'centroids': {profiles[i]: dict(zip(FEATURES, row.tolist())) for i, row in enumerate(centroids)},
        'assignments': [dict(block_id=item['block_id'], code=item['code'],
                             profile=profiles[int(np.argmax(p))], confidence=float(max(p)))
                        for item, p in zip(snapshot, posterior)],
    }
