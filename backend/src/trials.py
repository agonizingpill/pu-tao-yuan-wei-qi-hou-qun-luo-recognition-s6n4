import hashlib
import json
from datetime import timedelta

from fastapi import HTTPException
from psycopg.types.json import Jsonb

from .db import event
from .domain import Slot
from .fieldbook import one
from .mixture import assign_with_model


def baseline_run(db):
    return db.execute('''
        SELECT id,window_end,result FROM climate_run
        WHERE status='effective' ORDER BY id DESC LIMIT 1
    ''').fetchone()


def make_trial_snapshot(db, block, end):
    start = end - timedelta(days=2)
    readings = db.execute('''
        SELECT id,block_id,observed_day,slot,temp_c,rh_pct,source
        FROM microclimate_sample
        WHERE block_id=%s AND observed_day BETWEEN %s AND %s
        ORDER BY observed_day,slot,id
    ''', (block['id'], start, end)).fetchall()
    expected = {(start + timedelta(days=i), slot.value) for i in range(3) for slot in Slot}
    missing = sorted(expected - {(row['observed_day'], row['slot']) for row in readings})
    snapshot = [dict(block_id=block['id'], code=block['code'], sensor=block['sensor'],
                     readings=[dict(row, observed_day=row['observed_day'].isoformat()) for row in readings])]
    coverage = dict(code=block['code'], block_id=block['id'], sensor=block['sensor'],
                    received=len(readings), expected=len(expected),
                    missing=[{'day': day.isoformat(), 'slot': slot} for day, slot in missing],
                    deficient=len(missing) >= 2)
    return snapshot, coverage


def judge(db, block_id, end, actor):
    block = one(db, 'SELECT * FROM vine_block WHERE id=%s', (block_id,), '地块')
    if block['lifecycle'] != 'trial':
        raise HTTPException(409, f"{block['code']} 已是正式地块，试判仅面向试种地块")
    baseline = baseline_run(db)
    if baseline is None or not baseline['result'] or 'model' not in baseline['result']:
        raise HTTPException(409, '还没有带模型参数的已生效识别批次，无法试判')
    if end < baseline['window_end']:
        raise HTTPException(409, '试判窗口不能早于当前生效模型的采样窗口')
    snapshot, coverage = make_trial_snapshot(db, block, end)
    if coverage['deficient']:
        missing = '、'.join(f"{item['day'][5:]} {item['slot']}" for item in coverage['missing'])
        raise HTTPException(409, f"{block['code']} 试种读数缺测超过 25%（{missing}），请补录后再试判")

    outcome = assign_with_model(baseline['result']['model'], snapshot)
    assignment = outcome['assignments'][0]
    digest = hashlib.sha256(json.dumps(
        {'window_end': end.isoformat(), 'baseline_run_id': baseline['id'], 'blocks': snapshot},
        ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    payload = dict(window_end=end.isoformat(), digest=digest, coverage=coverage,
                   baseline_run_id=baseline['id'], **outcome)

    existing = db.execute('SELECT * FROM trial_judgment WHERE block_id=%s', (block_id,)).fetchone()
    if existing is None:
        row = db.execute('''
            INSERT INTO trial_judgment(block_id,baseline_run_id,window_end,status,profile,confidence,result,actor)
            VALUES (%s,%s,%s,'current',%s,%s,%s,%s) RETURNING *
        ''', (block_id, baseline['id'], end, assignment['profile'],
              assignment['confidence'], Jsonb(payload), actor)).fetchone()
        event(db, actor, 'trial_judged', block['code'], judgment_id=row['id'],
              baseline_run_id=baseline['id'], profile=assignment['profile'], retried=False)
    else:
        history = list(existing['history'])
        history.append(dict(baseline_run_id=existing['baseline_run_id'], window_end=existing['window_end'].isoformat(),
                            profile=existing['profile'], confidence=existing['confidence'],
                            status=existing['status'], attempts=existing['attempts'],
                            actor=existing['actor'], at=existing['updated_at'].isoformat()))
        row = db.execute('''
            UPDATE trial_judgment SET baseline_run_id=%s,window_end=%s,status='current',profile=%s,
                confidence=%s,attempts=attempts+1,result=%s,history=%s,updated_at=now()
            WHERE block_id=%s RETURNING *
        ''', (baseline['id'], end, assignment['profile'], assignment['confidence'],
              Jsonb(payload), Jsonb(history), block_id)).fetchone()
        event(db, actor, 'trial_judged', block['code'], judgment_id=row['id'],
              baseline_run_id=baseline['id'], profile=assignment['profile'], retried=True,
              previous_baseline_run_id=existing['baseline_run_id'])
    return judgment_view(db, row['id'])


def judgment_view(db, judgment_id):
    return one(db, '''
        SELECT t.*, b.code AS block_code, b.name AS block_name, r.window_end AS baseline_window_end
        FROM trial_judgment t JOIN vine_block b ON b.id=t.block_id
        JOIN climate_run r ON r.id=t.baseline_run_id
        WHERE t.id=%s
    ''', (judgment_id,), '试判记录')


def list_judgments(db):
    return db.execute('''
        SELECT t.*, b.code AS block_code, b.name AS block_name, r.window_end AS baseline_window_end
        FROM trial_judgment t JOIN vine_block b ON b.id=t.block_id
        JOIN climate_run r ON r.id=t.baseline_run_id
        ORDER BY b.code
    ''').fetchall()
