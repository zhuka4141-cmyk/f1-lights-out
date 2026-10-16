import { RULES, overallScore, isScoringResult } from './core.mjs';
const NS = 'http://www.w3.org/2000/svg';
const svgNode = (name, attributes = {}, text) => {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  if (text != null) node.textContent = text;
  return node;
};
const metric = (id, value, unit, digits) => {
  const element = document.getElementById(id); element.replaceChildren();
  if (value == null) { element.textContent = '—'; return; }
  element.append(document.createTextNode(value.toFixed(digits)));
  const small = document.createElement('small'); small.textContent = unit; element.append(small);
};

export function renderChart(target, stats, type, acceleration = false) {
  target.replaceChildren();
  const history = acceleration ? stats?.accelerationHistory : stats?.history;
  if (!history?.length) {
    const empty = document.createElement('div'); empty.className = 'chart-empty';
    empty.textContent = acceleration ? '本轮尚未起步，暂无加速曲线。' : type === 'collision'
      ? `本轮未踩刹车，车辆以 ${(stats?.outcomeSpeed ?? RULES.maxSpeed * 3.6).toFixed(1)} km/h 撞上路障。`
      : '本轮尚未刹车，暂无制动曲线。';
    target.append(empty); return;
  }
  const width = 420, height = 152;
  const left = 30, right = 32, top = 18, bottom = 26;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const duration = Math.max(.1, history.at(-1).time);
  const speedMax = Math.max(100, Math.ceil(Math.max(...history.map(s => s.speed)) / 100) * 100);
  const pressureMax = acceleration ? 100 : 125;
  const x = time => left + time / duration * plotWidth;
  const speedY = speed => top + (1 - speed / speedMax) * plotHeight;
  const pressureY = pressure => top + (1 - pressure / pressureMax) * plotHeight;
  const description = acceleration ? `加速过程曲线，起步至${type === 'engine-blown' ? '爆缸' : type === 'short-stop' ? '停车' : '冲线或本轮结束'}，持续 ${duration.toFixed(3)} 秒。白色为车速。`
    : `制动过程曲线，持续 ${duration.toFixed(3)} 秒，初速度 ${(stats.initialSpeed ?? 0).toFixed(1)} km/h，最高压力 ${(stats.peakPressure ?? 0).toFixed(1)}%。白色为车速，红色为刹车压力，红虚线为 115% 打滑线。`;
  const svg = svgNode('svg', { viewBox: `0 0 ${width} ${height}`, role: 'img', 'aria-label': description });
  for (let i = 0; i <= 3; i++) {
    const y = top + i / 3 * plotHeight;
    svg.append(svgNode('line', { x1: left, x2: width - right, y1: y, y2: y, stroke: '#ffffff12', 'stroke-dasharray': '3 5' }));
    svg.append(svgNode('text', { x: left - 6, y: y + 3, 'text-anchor': 'end', fill: '#bdbdbd', 'font-size': 9 }, Math.round(speedMax * (1 - i / 3))));
    if (!acceleration) svg.append(svgNode('text', { x: width - right + 6, y: y + 3, fill: '#ff8981', 'font-size': 9 }, Math.round(pressureMax * (1 - i / 3))));
  }
  for (let i = 0; i <= 4; i++) {
    const time = duration * i / 4;
    svg.append(svgNode('text', { x: x(time), y: height - 12, 'text-anchor': 'middle', fill: '#bdbdbd', 'font-size': 9 }, `${time.toFixed(duration < 4 ? 1 : 0)}s`));
  }
  if (!acceleration) {
    const limitY = pressureY(RULES.skidPressure * 100);
    svg.append(svgNode('line', { x1: left, x2: width - right, y1: limitY, y2: limitY, stroke: '#f34a36', 'stroke-width': 1, 'stroke-dasharray': '5 4', opacity: .8 }));
    svg.append(svgNode('text', { x: width - right - 3, y: limitY - 5, 'text-anchor': 'end', fill: '#f28b68', 'font-size': 9 }, '115% 打滑线'));
  }
  const speedPoints = history.map(sample => [x(sample.time), speedY(sample.speed)]);
  const line = points => points.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
  svg.append(svgNode('path', { d: `${line(speedPoints)} L${x(duration)},${top + plotHeight} L${left},${top + plotHeight} Z`, fill: '#ffffff08' }));
  svg.append(svgNode('path', { d: line(speedPoints), fill: 'none', stroke: '#ffffff', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  if (!acceleration) {
    const pressurePoints = history.map(sample => [x(sample.time), pressureY(sample.pressure)]);
    svg.append(svgNode('path', { d: line(pressurePoints), fill: 'none', stroke: '#ef3b32', 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
  }
  const lock = !acceleration && history.find(sample => sample.pressure >= 115 - 1e-5);
  if (lock) {
    const px = x(lock.time), py = pressureY(lock.pressure);
    svg.append(svgNode('path', { d: `M${px - 4},${py - 4} L${px + 4},${py + 4} M${px - 4},${py + 4} L${px + 4},${py - 4}`, stroke: '#ff5d3c', 'stroke-width': 2 }));
  }
  if ((!acceleration && type === 'collision') || (acceleration && type === 'engine-blown')) {
    const sample = history.at(-1);
    svg.append(svgNode('circle', { cx: x(sample.time), cy: speedY(sample.speed), r: 3.5, fill: '#ff6b4c' }));
    svg.append(svgNode('text', { x: x(sample.time) - 5, y: speedY(sample.speed) - 8, 'text-anchor': 'end', fill: '#ffa17a', 'font-size': 9 }, acceleration ? '爆缸' : '碰撞'));
  }
  target.append(svg);
}

export function renderReport(result) {
  const element = id => document.getElementById(id), valid = isScoringResult(result);
  const failures = {
    'false-start': ['抢跑了。', '发车信号尚未发出。等待五组红灯全部熄灭，再踩油门。', '抢跑'],
    timeout: ['错过了发车。', '灯灭后 10 秒内未起步，重新就位再试一次。', '未起步'],
    cancelled: ['本轮已取消。', '比赛中离开页面会取消本轮成绩。', '已取消'],
    skid: ['刹车锁死，打滑。', '压力达到 115%，轮胎锁死。本轮无效；下次松开卸压，再分段刹车。', '打滑失败'],
    'short-stop': ['还没冲过终点线。', '必须先用油门冲过 1250 米终点线，再在路障前刹停。本轮不计分。', '未完成赛段'],
    'engine-blown': ['引擎爆炸。', '速度超过 250 km/h，引擎爆缸。本轮失败，车辆失去动力后继续惯性滑行。', '引擎失败'],
    collision: ['撞上路障。', `车辆撞上终点线后 ${RULES.roadblockGap} 米处的黄黑路障，本轮无效。${result.stats?.outcomeSpeed != null ? `碰撞速度 ${result.stats.outcomeSpeed.toFixed(1)} km/h。` : ''}`, '碰撞失败'],
  };
  const failure = failures[result.type] || failures.cancelled;
  element('resultPanel').classList.toggle('failure', !valid);
  element('resultTitle').textContent = valid ? (result.distanceCm <= 100 ? '贴近极限，稳稳停住。' : '刹停完成。') : failure[0];
  element('resultDescription').textContent = valid
    ? `已冲过终点线，并在终点线后 ${RULES.roadblockGap} 米的路障前停稳。距离路障越近，得分越高。` : failure[1];
  element('resultBadge').textContent = valid ? '有效刹停' : failure[2];
  const hasOffset = Number.isFinite(result.offsetCm);
  element('offsetLabel').textContent = hasOffset ? result.type === 'engine-blown' ? '爆缸时距路障' : '车头距路障' : '本轮结果';
  element('resultTime').textContent = hasOffset ? (result.distanceCm / 100).toFixed(2) : failure[2];
  element('resultTime').style.fontSize = hasOffset ? '' : '28px';
  element('resultUnit').textContent = hasOffset ? 'm' : '';
  const timing = element('completionTime'); timing.replaceChildren();
  if (result.finishMs == null && result.ms != null) timing.append(document.createTextNode('未冲过终点线'));
  if (result.ms != null) {
    const reaction = document.createElement('span'); reaction.className = 'completion-reaction';
    reaction.textContent = `起步反应 ${result.ms} ms`; timing.append(reaction);
  } else if (result.finishMs == null) timing.textContent = '等待下一次发车';
  const stats = result.stats;
  metric('statBrakeTime', result.finishMs == null ? null : result.finishMs / 1000, 's', 3);
  metric('statBrakeDistance', stats?.brakeDistance, 'm', 2);
  metric('statPeakPressure', stats?.peakPressure, '%', 1);
  element('statBrakeTimeLabel').textContent = '冲线时间';
  element('chartNote').textContent = stats?.history?.length
    ? '从第一次刹车开始，含松开滑行时间；红虚线为 115% 打滑线。'
    : '完成起步并首次刹车后，将自动记录车速与压力曲线。';
  renderChart(element('brakeChart'), stats, result.type);
  renderChart(element('accelerationChart'), stats, result.type, true);
  element('sessionScore').textContent = valid ? overallScore(result).toFixed(2) : '0';
  element('resultAnnouncement').textContent = `${element('resultTitle').textContent} ${element('resultDescription').textContent} ${element('completionTime').textContent} 冲线时间 ${element('statBrakeTime').textContent}`;
}
