import { RULES, StartSequence, DriveChallenge, LocalLeaderboard, rankLeaderboard } from './core.mjs';
import { createScene } from './scene.mjs';
import { renderReport } from './report.mjs';
import { renderLeaderboard } from './leaderboard.mjs';

const $ = id => document.getElementById(id);
const sequence = new StartSequence(), drive = new DriveChallenge();
const board = new LocalLeaderboard({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) });
const held = new Set();
let world, driveClock = 0, keyHeld = false, resultShown = false, selectedId = null;
const activeDrive = () => ['driving', 'skidding'].includes(drive.phase);
function advance(now = performance.now()) {
  if (activeDrive()) { drive.step(Math.max(0, (now - driveClock) / 1000)); driveClock = now; }
}
function pedalMode(brake) {
  $('throttleButton').classList.toggle('brake-mode', brake);
  $('pedalLabel').textContent = brake ? '刹车' : '油门';
  $('pedalEnglish').textContent = brake ? 'BRAKE' : 'THROTTLE';
  $('throttleButton').setAttribute('aria-label', brake ? '按住刹车' : '踩下油门');
  if (brake) $('throttleButton').setAttribute('aria-pressed', 'false');
  else $('throttleButton').removeAttribute('aria-pressed');
}
function resetConsent() {
  board.offer(null); $('scoreConsent').hidden = $('scoreForm').hidden = $('saveFeedback').hidden = true;
  $('scoreForm').reset(); $('driverName').removeAttribute('aria-invalid'); $('saveFeedback').classList.remove('error');
}
function begin() {
  if (!world || $('leaderboardDialog').open || activeDrive() || ['sequence', 'waiting', 'go'].includes(sequence.phase)) return;
  held.clear(); resetConsent(); drive.reset(); world.reset(); sequence.start(performance.now());
  resultShown = false; $('introPanel').hidden = true; $('resultPanel').hidden = true; $('resultScrim').hidden = true;
  $('liveReaction').hidden = $('brakeGauge').hidden = true;
  $('throttleButton').disabled = false; $('throttleButton').classList.remove('ready', 'down');
  $('pedalHint').textContent = '灯灭后，再踩下'; pedalMode(false);
  $('resultAnnouncement').textContent = ''; $('throttleButton').focus({ preventScroll: true });
}
function showResult(result) {
  if (!result || resultShown) return;
  resultShown = true; held.clear();
  resetConsent(); renderReport(result); board.offer(result);
  $('scoreConsent').hidden = result.type !== 'valid';
  $('introPanel').hidden = $('liveReaction').hidden = $('brakeGauge').hidden = true;
  $('resultPanel').hidden = $('resultScrim').hidden = false;
  $('throttleButton').disabled = true; $('throttleButton').classList.remove('ready', 'down');
  document.body.dataset.phase = 'result'; $('resultPanel').scrollTop = 0;
  $('resultPanel').focus({ preventScroll: true });
}
function syncBrake() {
  advance(); drive.setBraking(held.size > 0);
  $('throttleButton').classList.toggle('down', drive.phase === 'driving' && drive.braking);
}
function press(source) {
  if (!world || $('leaderboardDialog').open || resultShown) return;
  if (drive.phase === 'driving') { held.add(source); syncBrake(); return; }
  if (sequence.phase === 'idle') { begin(); return; }
  // Refresh the lights before the input, using the same clock as rendering.
  const now = performance.now(); sequence.tick(now);
  const result = sequence.accelerate(now);
  if (result?.type === 'valid') {
    drive.launch(result.ms); driveClock = now; pedalMode(true);
    $('liveReaction').hidden = $('brakeGauge').hidden = false;
    $('liveSecondary').textContent = `起步反应 ${result.ms} ms`;
    $('pedalHint').textContent = '按住刹车 · 松开卸压';
    $('throttleButton').classList.remove('ready');
  } else if (result) showResult(result);
}
function release(source) {
  if (held.delete(source) && drive.phase === 'driving') syncBrake();
}
function cancel() {
  advance(); held.clear(); keyHeld = false;
  const result = activeDrive() ? drive.cancel() : sequence.cancel();
  if (result) { world?.setLights(0); showResult(result); }
}
function home(event) {
  event?.preventDefault(); if (!world) return;
  held.clear(); keyHeld = false; resetConsent(); sequence.reset(); drive.reset(); world.reset(); world.setLights(0);
  resultShown = false; $('resultPanel').hidden = $('resultScrim').hidden = $('liveReaction').hidden = $('brakeGauge').hidden = true;
  $('introPanel').hidden = false; $('throttleButton').disabled = true;
  $('throttleButton').classList.remove('ready', 'down'); pedalMode(false);
  document.body.dataset.phase = 'idle'; $('resultAnnouncement').textContent = ''; $('startButton').focus({ preventScroll: true });
}
function renderBoard() {
  renderLeaderboard(board.entries, selectedId);
}
function openBoard() { cancel(); renderBoard(); $('leaderboardDialog').showModal(); }
function skipSave() {
  resetConsent(); $('saveFeedback').hidden = false; $('saveFeedback').textContent = '这次成绩未记录。'; $('retryButton').focus({ preventScroll: true });
}
$('startButton').addEventListener('click', begin); $('retryButton').addEventListener('click', begin);
$('resultHomeButton').addEventListener('click', home);
$('leaderboardButton').addEventListener('click', openBoard);
$('closeLeaderboard').addEventListener('click', () => $('leaderboardDialog').close());
$('leaderboardDialog').addEventListener('click', event => {
  if (event.target !== $('leaderboardDialog')) return;
  const box = event.target.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) event.target.close();
});
$('throttleButton').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault(); $('throttleButton').setPointerCapture(event.pointerId); press(`pointer-${event.pointerId}`);
});
for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) window.addEventListener(name, event => release(`pointer-${event.pointerId}`));
$('throttleButton').addEventListener('contextmenu', event => event.preventDefault());
$('throttleButton').addEventListener('click', event => {
  if (event.detail !== 0 || keyHeld) return;
  if (drive.phase === 'driving') { if (held.has('assistive')) release('assistive'); else press('assistive'); }
  else press('assistive');
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
  if (event.code !== 'Space' || event.target.closest('input,textarea,select,[contenteditable=true],#leaderboardButton')) return;
  event.preventDefault(); if (event.repeat || keyHeld) return;
  keyHeld = true; press('keyboard');
});
window.addEventListener('keyup', event => { if (event.code === 'Space') { keyHeld = false; release('keyboard'); } });
window.addEventListener('blur', () => { keyHeld = false; held.clear(); if (drive.phase === 'driving') syncBrake(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
$('saveYes').addEventListener('click', () => { board.agree(); $('scoreConsent').hidden = true; $('scoreForm').hidden = false; $('driverName').focus({ preventScroll: true }); });
$('saveNo').addEventListener('click', skipSave); $('cancelSave').addEventListener('click', skipSave);
$('driverName').addEventListener('input', () => { $('driverName').removeAttribute('aria-invalid'); $('saveFeedback').hidden = true; });
$('scoreForm').addEventListener('submit', event => {
  event.preventDefault();
  try {
    const entry = board.save($('driverName').value); selectedId = entry.id;
    $('scoreForm').hidden = true; $('saveFeedback').hidden = false; $('saveFeedback').classList.remove('error');
    const driverKey = name => name.trim().normalize('NFKC').toLowerCase();
    const ranks = [['distanceCm', '距离'], ['ms', '反应'], ['totalMs', '完成时间'], ['score', '综合得分']].map(([metric, label]) => {
      const best = rankLeaderboard(board.entries, metric).find(item => driverKey(item.name) === driverKey(entry.name));
      return `${label}第 ${best.rank} 名`;
    });
    $('saveFeedback').textContent = `${entry.name}，成绩已记录 · ${ranks.join(' · ')}`;
    renderBoard(); $('leaderboardDialog').showModal();
  } catch (error) {
    const nameError = error.message.includes('名字');
    $('saveFeedback').hidden = false; $('saveFeedback').classList.add('error');
    $('saveFeedback').textContent = nameError ? error.message : '本设备暂时无法保存，请检查浏览器存储设置后再试。';
    $('driverName').setAttribute('aria-invalid', String(nameError)); $('driverName').focus({ preventScroll: true });
  }
});
const rpm = [...$('rpmStrip').children];
function frame(now) {
  if (world) {
    sequence.tick(now); advance(now); world.setLights(sequence.lights);
    if (!resultShown && drive.result) showResult(drive.result);
    else if (!resultShown && !activeDrive() && sequence.result?.type !== 'valid' && sequence.result) showResult(sequence.result);
    const phase = resultShown ? 'result' : drive.phase === 'skidding' ? 'skidding'
      : drive.phase === 'driving' ? drive.braking ? 'braking' : drive.propulsionCut ? 'coasting' : 'driving' : sequence.phase;
    document.body.dataset.phase = phase;
    $('throttleButton').classList.toggle('ready', phase === 'go');
    if (activeDrive()) {
      const distanceToLine = RULES.distance - drive.distance;
      $('liveLabel').textContent = distanceToLine < 0 ? '越过终点线' : '距终点线';
      $('liveTime').textContent = Math.abs(distanceToLine).toFixed(2);
      $('throttleButton').disabled = drive.skidded;
      $('throttleButton').classList.toggle('down', drive.braking);
      $('throttleButton').setAttribute('aria-pressed', String(drive.braking));
      $('pedalHint').textContent = drive.skidded ? '轮胎锁死' : drive.propulsionCut ? '按住刹车 · 松开仅滑行' : '按住刹车 · 首次即断动力';
    }
    const pressure = Math.max(0, drive.brakePressure * 100);
    $('pressureValue').textContent = `${pressure.toFixed(0)}%`;
    $('pressureFill').style.height = `${Math.min(100, pressure / 115 * 100)}%`;
    $('brakeGauge').setAttribute('aria-valuenow', pressure.toFixed(1));
    $('brakeGauge').classList.toggle('danger', pressure >= 100);
    $('pressureHint').textContent = pressure >= 100 ? '接近 115%！松开卸压' : '可分段刹车';
    const speed = Math.round(drive.speed * 3.6), driving = drive.phase === 'driving';
    $('speed').textContent = String(speed).padStart(3, '0'); $('gear').textContent = speed < 1 ? 'N' : String(Math.min(8, 1 + Math.floor(speed / 40)));
    const input = driving ? drive.braking ? Math.round(pressure) : drive.propulsionCut ? 0 : 100 : 0;
    $('inputValue').firstChild.textContent = input;
    $('inputLabel').textContent = driving && drive.braking ? 'BRAKE' : drive.propulsionCut ? 'POWER OFF' : 'THROTTLE';
    const bars = driving ? drive.braking ? Math.ceil(pressure / 115 * 12) : Math.min(12, 3 + speed / 30) : ['sequence', 'waiting'].includes(phase) ? 3 : 0;
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
