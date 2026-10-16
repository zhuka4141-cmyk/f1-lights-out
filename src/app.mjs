import { RULES, GEARBOX, StartSequence, DriveChallenge, rankLeaderboard, isScoringResult } from './core.mjs';
import { OnlineLeaderboard } from './online.mjs';
import { createScene } from './scene.mjs';
import { renderReport } from './report.mjs';
import { renderLeaderboard } from './leaderboard.mjs';
import { COLLISION_REPLAY_MS } from './impact.mjs';

const elements = new Map();
const $ = id => {
  if (!elements.has(id)) elements.set(id, document.getElementById(id));
  return elements.get(id);
};
const text = (id, value) => { const node = $(id), next = String(value); if (node.textContent !== next) node.textContent = next; };
const attribute = (id, name, value) => { const node = $(id), next = String(value); if (node.getAttribute(name) !== next) node.setAttribute(name,next); };
const sequence = new StartSequence(), drive = new DriveChallenge();
const board = new OnlineLeaderboard();
const held = { throttle: new Set(), brake: new Set() }, keysHeld = new Set();
const clearHeld = () => {
  held.throttle.clear(); held.brake.clear(); keysHeld.clear();
  attribute('throttleButton', 'aria-pressed', false); attribute('brakeButton', 'aria-pressed', false);
};
const pedalKeys = new Map([['KeyW', 'throttle'], ['KeyS', 'brake'], ['Space', 'throttle'], ['ArrowRight', 'throttle'], ['ArrowLeft', 'brake']]);
let world, driveClock = 0, resultShown = false, selectedId = null, collisionAt = null, submittingScore = false;
const activeDrive = () => ['driving', 'skidding'].includes(drive.phase);
function fitReport() {
  const panel = $('resultPanel'); if (panel.hidden) return;
  const scale = Math.min(1, (window.innerHeight - 16) / panel.offsetHeight, (window.innerWidth - 16) / panel.offsetWidth);
  panel.style.setProperty('--report-scale', String(scale));
}
new ResizeObserver(fitReport).observe($('resultContent'));
window.addEventListener('resize', fitReport);
function advance(now = performance.now()) {
  if (activeDrive()) { drive.step(Math.max(0, (now - driveClock) / 1000)); driveClock = now; }
}
function resetConsent() {
  board.offer(null); $('scoreConsent').hidden = $('scoreForm').hidden = $('saveFeedback').hidden = true;
  $('scoreForm').reset(); $('driverName').removeAttribute('aria-invalid'); $('saveFeedback').classList.remove('error');
}
function begin() {
  if (submittingScore) return;
  if (!world || $('leaderboardDialog').open || activeDrive() || ['sequence', 'waiting', 'go'].includes(sequence.phase)) return;
  clearHeld(); resetConsent(); drive.reset(); world.reset(); sequence.start(performance.now());
  board.startRun();
  resultShown = false; collisionAt = null; $('leaderboardButton').disabled = false;
  $('introPanel').hidden = true; $('resultPanel').hidden = true; $('resultScrim').hidden = true;
  $('liveReaction').hidden = $('brakeGauge').hidden = true;
  $('throttleButton').disabled = false; $('throttleButton').classList.remove('ready', 'down');
  $('brakeButton').disabled = false; $('brakeButton').classList.remove('down');
  $('pedalHint').textContent = '灯灭后，再踩下';
  $('brakePedalHint').textContent = '可与油门同时踩';
  $('resultAnnouncement').textContent = ''; $('throttleButton').focus({ preventScroll: true });
}
function showResult(result) {
  if (!result || resultShown) return;
  resultShown = true; clearHeld();
  $('leaderboardButton').disabled = false;
  resetConsent(); renderReport(result); board.offer(result, drive);
  $('scoreConsent').hidden = !isScoringResult(result);
  $('introPanel').hidden = $('liveReaction').hidden = $('brakeGauge').hidden = true;
  $('resultPanel').hidden = $('resultScrim').hidden = false;
  fitReport();
  $('throttleButton').disabled = true; $('throttleButton').classList.remove('ready', 'down');
  $('brakeButton').disabled = true; $('brakeButton').classList.remove('down');
  document.body.dataset.phase = 'result'; $('resultPanel').scrollTop = 0;
  $('resultPanel').focus({ preventScroll: true });
}
function syncInput() {
  advance();
  drive.setThrottle(held.throttle.size > 0); drive.setBraking(held.brake.size > 0);
  $('throttleButton').classList.toggle('down', drive.phase === 'driving' && drive.throttle);
  $('brakeButton').classList.toggle('down', drive.phase === 'driving' && drive.braking);
}
function press(pedal, source) {
  if (!world || $('leaderboardDialog').open || resultShown) return;
  if (drive.phase === 'driving') { advance(); held[pedal].add(source); syncInput(); return; }
  if (sequence.phase === 'idle') { begin(); return; }
  if (pedal === 'brake') { held.brake.add(source); return; }
  // Refresh the lights before the input, using the same clock as rendering.
  const now = performance.now(); sequence.tick(now);
  const result = sequence.accelerate(now);
  if (result?.type === 'valid') {
    drive.launch(result.ms); driveClock = now;
    held.throttle.add(source); drive.setThrottle(true); drive.setBraking(held.brake.size > 0);
    $('liveReaction').hidden = $('brakeGauge').hidden = false;
    $('liveSecondary').textContent = `起步反应 ${result.ms} ms`;
    $('pedalHint').textContent = '按住油门 · 超过 250 爆缸';
    $('throttleButton').classList.remove('ready');
  } else if (result) showResult(result);
}
function release(pedal, source) {
  if (held[pedal].delete(source) && drive.phase === 'driving') syncInput();
}
function cancel() {
  advance(); clearHeld();
  const result = activeDrive() ? drive.cancel() : sequence.cancel();
  if (result) { world?.setLights(0); showResult(result); }
}
function home(event) {
  if (submittingScore) return;
  event?.preventDefault(); if (!world) return;
  clearHeld(); resetConsent(); sequence.reset(); drive.reset(); world.reset(); world.setLights(0);
  resultShown = false; collisionAt = null; $('leaderboardButton').disabled = false;
  $('resultPanel').hidden = $('resultScrim').hidden = $('liveReaction').hidden = $('brakeGauge').hidden = true;
  $('introPanel').hidden = false; $('throttleButton').disabled = true;
  $('throttleButton').classList.remove('ready', 'down');
  $('brakeButton').disabled = true; $('brakeButton').classList.remove('down');
  $('pedalHint').textContent = '灯灭后，再踩下';
  document.body.dataset.phase = 'idle'; $('resultAnnouncement').textContent = ''; $('startButton').focus({ preventScroll: true });
}
function renderBoard() {
  renderLeaderboard(board.entries, selectedId);
}
let boardLoading = false;
async function refreshBoard() {
  if (boardLoading) return;
  boardLoading = true; $('refreshLeaderboard').disabled = true;
  $('boardStatus').textContent = '正在同步…'; $('boardStatus').classList.remove('error');
  try { await board.load(); renderBoard(); $('boardStatus').textContent = '所有玩家共享'; }
  catch (error) { $('boardStatus').textContent = error.message; $('boardStatus').classList.add('error'); }
  finally { boardLoading = false; $('refreshLeaderboard').disabled = false; }
}
function openBoard() { cancel(); renderBoard(); $('leaderboardDialog').showModal(); refreshBoard(); }
setInterval(() => { if ($('leaderboardDialog').open && !document.hidden) refreshBoard(); }, 15000);
function skipSave() {
  if (submittingScore) return;
  resetConsent(); $('saveFeedback').hidden = false; $('saveFeedback').textContent = '这次成绩未记录。'; $('retryButton').focus({ preventScroll: true });
}
$('startButton').addEventListener('click', begin); $('retryButton').addEventListener('click', begin);
$('resultHomeButton').addEventListener('click', home);
$('leaderboardButton').addEventListener('click', openBoard);
$('refreshLeaderboard').addEventListener('click', refreshBoard);
$('closeLeaderboard').addEventListener('click', () => $('leaderboardDialog').close());
$('leaderboardDialog').addEventListener('click', event => {
  if (event.target !== $('leaderboardDialog')) return;
  const box = event.target.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) event.target.close();
});
for (const [pedal, id] of [['throttle', 'throttleButton'], ['brake', 'brakeButton']]) {
  $(id).addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    event.preventDefault(); $(id).setPointerCapture(event.pointerId); press(pedal, `pointer-${event.pointerId}`);
  });
  $(id).addEventListener('contextmenu', event => event.preventDefault());
  $(id).addEventListener('click', event => {
    if (event.detail !== 0 || keysHeld.size) return;
    if (held[pedal].has('assistive')) release(pedal, 'assistive'); else press(pedal, 'assistive');
  });
}
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(name, event => {
  release('throttle', `pointer-${event.pointerId}`); release('brake', `pointer-${event.pointerId}`);
});
window.addEventListener('keydown', event => {
  if ($('leaderboardDialog').open) return;
  if (resultShown) {
    if (event.code === 'Escape') { event.preventDefault(); home(); return; }
    if (event.code === 'Tab') {
      const focusable = [...$('resultPanel').querySelectorAll('button,input')].filter(element => element.getClientRects().length && !element.disabled);
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === $('resultPanel'))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('resultPanel'))) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  const pedal = pedalKeys.get(event.code);
  if (!pedal || event.target.closest('input,textarea,select,[contenteditable=true],#leaderboardButton')) return;
  event.preventDefault(); if (event.repeat || keysHeld.has(event.code)) return;
  keysHeld.add(event.code); press(pedal, `key-${event.code}`);
});
window.addEventListener('keyup', event => {
  const pedal = pedalKeys.get(event.code); if (pedal) { keysHeld.delete(event.code); release(pedal, `key-${event.code}`); }
});
window.addEventListener('blur', () => { clearHeld(); if (drive.phase === 'driving') syncInput(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
$('saveYes').addEventListener('click', () => { board.agree(); $('scoreConsent').hidden = true; $('scoreForm').hidden = false; $('driverName').focus({ preventScroll: true }); });
$('saveNo').addEventListener('click', skipSave); $('cancelSave').addEventListener('click', skipSave);
$('driverName').addEventListener('input', () => { $('driverName').removeAttribute('aria-invalid'); $('saveFeedback').hidden = true; });
$('scoreForm').addEventListener('submit', async event => {
  event.preventDefault();
  const submit = $('scoreForm').querySelector('[type="submit"]');
  if (submit.disabled) return;
  submittingScore = true; submit.disabled = true; submit.textContent = '提交中…';
  $('cancelSave').disabled = $('driverName').disabled = true;
  $('retryButton').disabled = $('resultHomeButton').disabled = true;
  try {
    const entry = await board.save($('driverName').value); selectedId = entry.id;
    $('scoreForm').hidden = true; $('saveFeedback').hidden = false; $('saveFeedback').classList.remove('error');
    const ranks = [['distanceCm', '距离'], ['ms', '反应'], ['finishMs', '冲线'], ['score', '综合得分']].map(([metric, label]) => {
      const best = rankLeaderboard(board.entries, metric).find(item => item.playerId === entry.playerId);
      return `${label}第 ${best.rank} 名`;
    });
    $('saveFeedback').textContent = `${entry.name}，已上在线榜 · ${ranks.join(' · ')}`;
    $('boardStatus').textContent = '所有玩家共享';
    renderBoard(); $('leaderboardDialog').showModal();
  } catch (error) {
    const nameError = error.message.includes('名字');
    $('saveFeedback').hidden = false; $('saveFeedback').classList.add('error');
    $('saveFeedback').textContent = error.message;
    $('driverName').setAttribute('aria-invalid', String(nameError)); $('driverName').focus({ preventScroll: true });
  } finally {
    submittingScore = false; $('cancelSave').disabled = $('driverName').disabled = false;
    submit.disabled = false; submit.textContent = '提交上榜';
    $('retryButton').disabled = $('resultHomeButton').disabled = false;
  }
});
const rpm = [...$('rpmStrip').children];
function frame(now) {
  if (world) {
    sequence.tick(now); advance(now); world.setLights(sequence.lights);
    if (!resultShown && ['collision', 'engine-blown'].includes(drive.result?.type)) {
      if (collisionAt === null) {
        collisionAt = now; clearHeld();
        $('brakeButton').disabled = $('throttleButton').disabled = $('leaderboardButton').disabled = true;
        $('liveReaction').hidden = $('brakeGauge').hidden = true;
      }
      if (now - collisionAt >= COLLISION_REPLAY_MS) showResult(drive.result);
    } else if (!resultShown && drive.result) showResult(drive.result);
    else if (!resultShown && !activeDrive() && sequence.result?.type !== 'valid' && sequence.result) showResult(sequence.result);
    const phase = resultShown ? 'result' : collisionAt !== null ? 'crashing' : drive.phase === 'skidding' ? 'skidding'
      : drive.phase === 'driving' ? drive.braking ? 'braking' : drive.propulsionCut ? 'coasting' : 'driving' : sequence.phase;
    if (document.body.dataset.phase !== phase) document.body.dataset.phase = phase;
    $('throttleButton').classList.toggle('ready', phase === 'go');
    if (activeDrive()) {
      const remaining = RULES.distance + (drive.finishCrossed ? RULES.roadblockGap : 0) - drive.distance;
      text('liveLabel', drive.finishCrossed ? '距路障' : '距终点线');
      text('liveTime', Math.max(0, remaining).toFixed(2));
      text('liveSecondary', drive.finishCrossed ? `冲线 ${((drive.ms + Math.round(drive.finishAt * 1000)) / 1000).toFixed(3)} s` : `起步反应 ${drive.ms} ms`);
      $('throttleButton').disabled = drive.skidded || drive.finishCrossed;
      $('brakeButton').disabled = drive.skidded;
      $('throttleButton').classList.toggle('down', drive.throttle);
      $('brakeButton').classList.toggle('down', drive.braking);
      attribute('throttleButton', 'aria-pressed', drive.throttle);
      attribute('brakeButton', 'aria-pressed', drive.braking);
      text('pedalHint', drive.skidded ? '轮胎锁死' : drive.finishCrossed ? '已冲线 · 动力切断' : drive.speed * 3.6 >= 240 ? '接近 250！松开油门' : '按住加速 · 松开滑行');
      text('brakePedalHint', drive.skidded ? '轮胎锁死' : drive.finishCrossed ? '按住刹车 · 松开滑行' : '可与油门同时踩');
    }
    const pressure = Math.max(0, drive.brakePressure * 100);
    text('pressureValue', `${pressure.toFixed(0)}%`);
    const fillHeight = `${Math.min(100, pressure / 115 * 100)}%`;
    if ($('pressureFill').style.height !== fillHeight) $('pressureFill').style.height = fillHeight;
    attribute('brakeGauge', 'aria-valuenow', pressure.toFixed(1));
    $('brakeGauge').classList.toggle('danger', pressure >= 100);
    text('pressureHint', pressure >= 100 ? '接近 115%！松开卸压' : '可分段刹车');
    const speed = Math.round(drive.speed * 3.6), driving = drive.phase === 'driving';
    text('speed', String(speed).padStart(3, '0')); text('gear', activeDrive() ? drive.gear : 'N');
    const recentShift = activeDrive() && drive.elapsed - drive.lastShiftAt < .5;
    $('gear').classList.toggle('shifting', recentShift);
    text('gearAction', recentShift ? drive.lastShiftDirection === 'up' ? '升挡' : '降挡' : 'GEAR');
    const rpmValue = (drive.rpm / 1000).toFixed(1);
    if ($('inputValue').firstChild.textContent !== rpmValue) $('inputValue').firstChild.textContent = rpmValue;
    text('inputLabel', 'RPM');
    $('speed').classList.toggle('overspeed-warning', driving && speed >= 240);
    const bars = activeDrive() ? Math.ceil(drive.rpm / GEARBOX.maxRpm * 12) : ['sequence', 'waiting'].includes(phase) ? 3 : 0;
    rpm.forEach((element, i) => element.classList.toggle('active', i < bars));
    world.render(now, drive);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
createScene($('world')).then(scene => {
  world = scene; $('startButton').disabled = false; $('startLabel').textContent = '开始';
}).catch(error => {
  console.error('Race scene failed to load', error); $('startLabel').textContent = '场景装载失败'; $('loadError').hidden = false;
  $('loadError').textContent = '3D 场景未能启动。请使用支持 WebGL 的新版 Chrome、Edge 或 Safari，开启图形加速，并确认已上传整个项目的 assets、vendor 和 src 文件夹。';
});
