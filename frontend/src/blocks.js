import {slots, profiles, lifecycles, trialStates} from './domain.js';
import {safe, num, notice, tag, title, field, table, select, button} from './ui.js';

const lifecycleTag = block => block.lifecycle === 'trial'
  ? '<span class="tag neutral">试种地</span>' : '<span class="tag active">正式</span>';

export function blockPage(blocks, block, history, canWrite, supervisor) {
  const geometry = blocks.map(b => `<button type="button" class="parcel ${safe(b.profile || 'neutral')} ${b.lifecycle === 'trial' ? 'trial' : ''} ${b.id === block?.id ? 'chosen' : ''}"
    data-block="${b.id}" aria-pressed="${b.id === block?.id}" style="--e:${b.east_m/10}%;--n:${b.north_m/10}%;--w:${b.width_m/10}%;--h:${b.height_m/10}%">${safe(b.code)}<small>${safe(b.name)}</small></button>`).join('');
  const rows = blocks.map(b => `<tr><td><button class="text-button" data-block="${b.id}">${safe(b.code)}</button></td><td>${safe(b.name)}</td><td>${safe(b.sensor)}</td><td>${lifecycleTag(b)}</td><td>${b.lifecycle === 'trial' ? (b.trial_status ? tag(b.trial_profile) : '<span class="tag neutral">待试判</span>') : tag(b.profile)}</td></tr>`);
  return `${title('地块与采样', '新租地块先以试种地建档：读数只供已生效模型试判，不参与群落拟合。')}
    <div class="spread">
      <section><div class="section-label"><h2>坡畦边界图</h2><span>局部坐标 · 1,000 × 1,000 m</span></div>
        <div class="survey-map"><span class="north">↑ N</span><div class="site">${geometry}</div><span class="scale">虚线边界为试种地</span></div>
        <div class="legend">${Object.keys(profiles).map(tag).join('')}${lifecycleTag({lifecycle:'trial'})}</div>
        ${rows.length ? table(['地块','地形名','绑定探头','身份','群落结论'], rows) : notice('还没有地块。登记边界与探头后开始记采。')}
      </section>
      <section class="ledger">${block ? `
        <span class="ref">${safe(block.code)} / ${safe(block.sensor)}</span>
        <h2>${safe(block.name)} ${lifecycleTag(block)}</h2>
        <p class="muted">${safe(block.cultivar)} · ${num(block.area_ha,2)} ha ${block.revision ? `· 标签 v${block.revision}` : ''}</p>
        ${block.lifecycle === 'trial' ? `
          ${block.trial_status ? `<p>试判结论 ${tag(block.trial_profile)} · ${safe(trialStates[block.trial_status])} · 后验 ${num(block.trial_confidence*100,1)}% · 基准批次 #${block.baseline_run_id}（窗口 ${safe(block.trial_window_end)}）</p>
            ${block.trial_status === 'expired' ? notice('新模型已发布，该结论基于旧基准，请到微气候群落页按新基准重算。', 'caution') : ''}
            <p class="muted">试判结论不产生生效标签，转正前不能安排滴灌；试种读数不参与拟合。</p>` :
            notice('试种地暂无试判结论。录入完整三日昼夜读数后，到微气候群落页发起试判。')}
          ${supervisor ? `<form data-action="promote" data-id="${block.id}">${button('主管转正为正式地块', 'secondary')}</form>` : '<p class="muted">转正由灌溉主管执行。</p>'}` :
          (block.revision ? '' : notice('该地块还没有生效标签。'))}
        ${canWrite ? `<details class="form-fold" id="capture"><summary>录入或补采读数</summary><form data-action="sample">
          <input type="hidden" name="block_id" value="${block.id}"><div class="fields">
          ${field('sensor','探头编号',`value="${safe(block.sensor)}" readonly`)}${field('observed_day','采样日期','type="date" value="2026-11-20"')}
          ${select('slot','采样班次',Object.entries(slots),'night')}${field('source','原始文件或巡检单','placeholder="wx-recheck-1121.csv" maxlength="90"')}
          ${field('temp_c','温度 °C','type="number" min="-30" max="60" step="0.1"')}${field('rh_pct','相对湿度 %','type="number" min="0" max="100" step="0.1"')}</div>${button('归档读数')}
        </form></details>` : ''}
        <h3>近期气象采样</h3>
        ${history.length ? table(['日期','班次','气温','湿度'], history.slice(0,12).map(r =>
          `<tr title="${safe(r.source)}"><td>${safe(r.observed_day.slice(5))}</td><td>${slots[r.slot]}</td><td>${num(r.temp_c)} °</td><td>${num(r.rh_pct,0)}%</td></tr>`)) : notice('这个探头还没有采样记录。')}` : notice('从边界图选择地块以查看采样。')}
      </section>
    </div>
    ${canWrite ? `<details class="form-fold bottom"><summary>登记新地块（默认试种地）</summary><form data-action="block"><div class="fields wide">
      ${field('code','地块编号','placeholder="V-07"')}${field('name','地形名')}${field('cultivar','品种')}${field('area_ha','面积 ha','type="number" min="0.01" max="500" step="0.01"')}
      ${field('sensor','探头编号','placeholder="WX-307"')}${field('east_m','西缘东距 m','type="number" min="0" max="999"')}${field('north_m','南缘北距 m','type="number" min="0" max="999"')}
      ${field('width_m','东西跨度 m','type="number" min="1" max="500"')}${field('height_m','南北跨度 m','type="number" min="1" max="500"')}</div>${button('登记为试种地块')}
    </form><p class="muted">新地块一律先以试种地建档，试种读数不参与拟合，主管转正后才纳入识别与排灌。</p></details>` : ''}`;
}
