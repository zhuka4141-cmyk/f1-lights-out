import { RULES, overallScore, isScoringResult } from './core.mjs';
import { t } from './i18n.mjs';
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
    empty.textContent = acceleration ? t('noAccel') : type === 'collision'
      ? t('noBrakeHit', { speed: (stats?.outcomeSpeed ?? RULES.maxSpeed * 3.6).toFixed(1) })
      : t('noBrake');
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
  const description = acceleration ? t('accelAria', { end: type === 'engine-blown' ? t('accelEndBlow') : type === 'short-stop' ? t('accelEndStop') : t('accelEndFinish'), duration: duration.toFixed(3) })
    : t('brakeAriaChart', { duration: duration.toFixed(3), speed: (stats.initialSpeed ?? 0).toFixed(1), pressure: (stats.peakPressure ?? 0).toFixed(1) });
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
    svg.append(svgNode('text', { x: width - right - 3, y: limitY - 5, 'text-anchor': 'end', fill: '#f28b68', 'font-size': 9 }, t('slipMark')));
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
    svg.append(svgNode('text', { x: x(sample.time) - 5, y: speedY(sample.speed) - 8, 'text-anchor': 'end', fill: '#ffa17a', 'font-size': 9 }, acceleration ? t('blownMark') : t('crashMark')));
  }
  target.append(svg);
}

export function renderReport(result) {
  const element = id => document.getElementById(id), valid = isScoringResult(result);
  const failures = {
    'false-start': [t('falseTitle'), t('falseDesc'), t('falseBadge')],
    timeout: [t('timeoutTitle'), t('timeoutDesc'), t('timeoutBadge')],
    cancelled: [t('cancelTitle'), t('cancelDesc'), t('cancelBadge')],
    skid: [t('skidTitle'), t('skidDesc'), t('skidBadge')],
    'short-stop': [t('shortTitle'), t('shortDesc'), t('shortBadge')],
    'engine-blown': [t('blowTitle'), t('blowDesc'), t('blowBadge')],
    collision: [t('hitTitle'), t('hitDesc', { gap: RULES.roadblockGap, speed: result.stats?.outcomeSpeed != null ? t('hitSpeed', { speed: result.stats.outcomeSpeed.toFixed(1) }) : '' }), t('hitBadge')],
  };
  const failure = failures[result.type] || failures.cancelled;
  element('resultPanel').classList.toggle('failure', !valid);
  element('resultTitle').textContent = valid ? (result.distanceCm <= 100 ? t('closeTitle') : t('doneTitle')) : failure[0];
  element('resultDescription').textContent = valid
    ? t('validDesc', { gap: RULES.roadblockGap }) : failure[1];
  element('resultBadge').textContent = valid ? t('validBadge') : failure[2];
  const hasOffset = Number.isFinite(result.offsetCm);
  element('offsetLabel').textContent = hasOffset ? result.type === 'engine-blown' ? t('offsetBlown') : t('offsetBarrier') : t('roundResult');
  element('resultTime').textContent = hasOffset ? (result.distanceCm / 100).toFixed(2) : failure[2];
  element('resultTime').style.fontSize = hasOffset ? '' : '28px';
  element('resultUnit').textContent = hasOffset ? 'm' : '';
  const timing = element('completionTime'); timing.replaceChildren();
  if (result.finishMs == null && result.ms != null) timing.append(document.createTextNode(t('notCrossed')));
  if (result.ms != null) {
    const reaction = document.createElement('span'); reaction.className = 'completion-reaction';
    reaction.textContent = t('reactionLine', { ms: result.ms }); timing.append(reaction);
  } else if (result.finishMs == null) timing.textContent = t('waitNext');
  const stats = result.stats;
  metric('statBrakeTime', result.finishMs == null ? null : result.finishMs / 1000, 's', 3);
  metric('statBrakeDistance', stats?.brakeDistance, 'm', 2);
  metric('statPeakPressure', stats?.peakPressure, '%', 1);
  element('statBrakeTimeLabel').textContent = t('finishTime');
  element('chartNote').textContent = stats?.history?.length
    ? t('chartNote')
    : t('chartEmptyNote');
  renderChart(element('brakeChart'), stats, result.type);
  renderChart(element('accelerationChart'), stats, result.type, true);
  element('sessionScore').textContent = valid ? overallScore(result).toFixed(2) : '0';
  element('resultAnnouncement').textContent = `${element('resultTitle').textContent} ${element('resultDescription').textContent} ${element('completionTime').textContent} ${t('finishTime')} ${element('statBrakeTime').textContent}`;
}
