import {runStates, slots, tagStates, trialStates} from './domain.js';
import {safe, num, notice, tag, title, field, table, select, button, paragraph} from './ui.js';

function bicScores(result) {
  const scores = Object.values(result.bic);
  const high = Math.max(...scores);
  const low = Math.min(...scores);
  return `<ul class="bic">${Object.entries(result.bic).map(([k, value]) => `
    <li class="${Number(k) === result.chosen_k ? 'selected' : ''}"><span>${k} 组</span>
    <i style="--size:${25+75*(high-value)/(high-low || 1)}%"></i><b>${num(value,2)}</b></li>`).join('')}</ul>`;
}

function trialSection(trialBlocks, judgments, canWrite) {
  if (!trialBlocks.length) return '';
  const judged = new Map(judgments.map(j => [j.block_id, j]));
  const rows = trialBlocks.map(b => {
    const j = judged.get(b.id);
    const state = j ? trialStates[j.status] : '待试判';
    return `<tr class="${j?.status === 'expired' ? 'warn-row' : ''}">
      <td>${safe(b.code)} ${safe(b.name)}</td><td>${j ? tag(j.profile) : '<span class="tag neutral">—</span>'}</td>
      <td>${j ? `${num(j.confidence*100,1)}%` : '—'}</td><td>${j ? `#${j.baseline_run_id} · ${safe(j.baseline_window_end)}` : '—'}</td>
      <td>${j ? `${safe(state)} · 试判 ${j.attempts} 次` : state}</td></tr>`;
  });
  const historyRows = judgments.flatMap(j => [
    ...j.history.map((h, i) => `<tr><td>${safe(j.block_code)}</td><td>${tag(h.profile)}</td><td>#${h.baseline_run_id}</td>
      <td>${safe(h.window_end)}</td><td>${trialStates[h.status]}</td><td>${safe(h.actor)} · v${j.attempts - j.history.length + i}</td></tr>`),
    `<tr class="${j.status==='expired'?'warn-row':''}"><td>${safe(j.block_code)}</td><td>${tag(j.profile)}</td><td>#${j.baseline_run_id}</td>
      <td>${safe(j.window_end)}</td><td>${trialStates[j.status]}</td><td>${safe(j.actor)} · v${j.attempts}</td></tr>`,
  ]);
  return `<section class="bottom"><div class="section-label"><h2>试种地试判</h2><span>复用已生效模型，不参与拟合</span></div>
    <p class="muted">试判只把已生效模型套用到试种地读数上；重试在原记录上覆盖更新，旧结论随基准批次保留。新模型发布后旧基准结论自动过期，需按新基准重算。</p>
    ${table(['试种地','试判群落','后验概率','基准批次','结论状态'], rows)}
    ${canWrite ? `<form data-action="trial" class="inline-form">
      ${select('block_id','选择试种地', trialBlocks.map(b => [b.id, `${b.code} ${b.name}`]))}
      ${field('window_end','试判窗口截止日','type="date" value="2026-11-20"')}
      ${button('按当前生效模型试判 / 重算')}</form>
      <p class="muted">需连续三日昼夜六笔读数齐全；同一地块试判或重试均不新增记录。</p>` : ''}
    <details class="form-fold"><summary>试判结论留痕（${historyRows.length} 条，含已覆盖的旧结论）</summary>
      ${historyRows.length ? table(['地块','结论','基准批次','窗口','状态','操作人 / 版本'], historyRows) : notice('还没有试判记录。')}</details>
  </section>`;
}

export function clusterPage(runs, run, labels, canWrite, supervisor, trialBlocks, judgments) {
  const result = run?.result;
  const healthRows = run?.coverage.map(c => `<tr class="${c.deficient?'warn-row':''}"><td>${safe(c.code)}</td><td>${safe(c.sensor)}</td><td>${c.received} / ${c.expected}</td>
    <td>${c.missing.map(m => `${safe(m.day.slice(5))} ${slots[m.slot]}`).join('、') || '齐全'}</td></tr>`);
  const review = run?.status === 'review';
  return `${title('微气候群落', '三个连续日期，每地块应有六笔昼夜采样。超过 25% 缺测时停止发布。试种地读数不参与拟合。')}
    <div class="spread ${review ? 'review-spread' : ''}">
      <section>
        <div class="section-label"><h2>识别批次</h2>${run ? `<span class="tag ${review || run.status==='blocked' ? 'warning' : 'neutral'}">${runStates[run.status]}</span>` : ''}</div>
        ${runs.length ? `<div class="selector">${select('run','查看采样窗口',runs.map(r => [r.id,`${r.window_end} · ${runStates[r.status]} · #${r.id}`]), run?.id)}</div>` : notice('从有完整采样的窗口发起第一次识别。')}
        ${run?.error ? notice(run.error, 'caution') : ''}
        ${run?.status === 'queued' ? notice('采样快照已冻结，正在等待后台识别。') : ''}
        ${review ? `<div class="review"><h3>这次标签变更影响已排轮次</h3><p>确认前继续沿用旧标签，受影响的轮次暂缓执行。确认后需按新标签改排。</p>
          ${table(['轮次','地块','排定时间','旧标签','候选标签'],run.affected.map(r => `<tr><td>${safe(r.code)}</td><td>${safe(r.block)}</td><td>${safe(r.starts_at)}</td><td>${tag(r.basis_profile)}</td><td>${tag(r.proposed_profile)}</td></tr>`))}
          ${supervisor ? `<form data-action="decision" data-id="${run.id}">${paragraph('reason','确认或退回理由','例：核对北坡备用探头，调整下一轮滴灌。')}
          <div class="actions"><button name="approve" value="true" class="primary">确认并标记待改排</button><button name="approve" value="false" class="secondary">退回候选标签</button></div></form>` : notice('请通知灌溉主管确认。')}</div>` : ''}
        ${healthRows?.length ? `<h3>探头覆盖（仅正式地块）</h3>${table(['地块','探头','有效读数','缺测班次'],healthRows)}` : ''}
        ${run?.status === 'failed' && canWrite ? `<form data-action="retry" data-id="${run.id}">${button('按原快照重试')}</form>` : ''}
        ${run ? `<p class="muted hash" title="${safe(run.digest)}">快照 ${safe(run.digest.slice(0,16))} · 计算 ${run.attempts} 次</p>` : ''}
      </section>
      <section class="ledger">
        ${canWrite ? `<h2>发起识别</h2><form data-action="run" class="inline-form">${field('window_end','窗口截止日','type="date" value="2026-11-20"')}${button('冻结采样并识别')}</form>
          <p class="muted">拟合仅纳入正式地块；试种地请用下方试判。</p>` : ''}
        ${result ? `<div class="section-label"><h2>BIC 组数比较</h2><span class="mono">选中 ${result.chosen_k} 组</span></div>
          ${bicScores(result)}<p class="muted">BIC 越小越合适。组名按温度与相对湿度的综合排序分配。</p>
          ${table(['群落','日 / 夜温 °C','日 / 夜湿 %'],Object.entries(result.centroids).map(([p,c]) =>
            `<tr><td>${tag(p)}</td><td>${num(c.day_temp)} / ${num(c.night_temp)}</td><td>${num(c.day_rh,0)} / ${num(c.night_rh,0)}</td></tr>`))}
          <button class="text-button evidence" type="button" data-evidence="${run.id}">保存拟合证据 JSON</button>` : ''}
      </section>
    </div>
    ${trialSection(trialBlocks, judgments, canWrite)}
    <section class="bottom"><h2>地块标签账</h2>${labels.length ? table(['地块','标签','版本','窗口截止','状态','后验概率'], labels.map(l =>
      `<tr><td>${safe(l.code)}</td><td>${tag(l.profile)}</td><td>v${l.revision}</td><td>${safe(l.window_end)}</td><td>${tagStates[l.state]}</td><td>${num(l.confidence*100,1)}%</td></tr>`)) : notice('模型开始发布标签后，这里会保留生效和历史版本。')}</section>`;
}
