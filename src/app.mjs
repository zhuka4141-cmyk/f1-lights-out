import { RULES, GEARBOX, StartSequence, DriveChallenge, rankLeaderboard, leaderboardIdentity, isScoringResult } from './core.mjs';
import { OnlineLeaderboard } from './online.mjs';
import { createScene } from './scene.mjs';
import { renderReport } from './report.mjs';
import { renderLeaderboard } from './leaderboard.mjs';
import { COLLISION_REPLAY_MS } from './impact.mjs';
import { createMusic } from './music.mjs';
import { createRaceAudio } from './race-audio.mjs';
import { normalizePlayerName } from './player-name.mjs';
import { apply, localizeError, t } from './i18n.mjs';

apply(document);
const elements = new Map();
const $ = id => {
  if (!elements.has(id)) elements.set(id, document.getElementById(id));
  return elements.get(id);
};
const text = (id, value) => { const node = $(id), next = String(value); if (node.textContent !== next) node.textContent = next; };
const attribute = (id, name, value) => { const node = $(id), next = String(value); if (node.getAttribute(name) !== next) node.setAttribute(name,next); };
const sequence = new StartSequence(), drive = new DriveChallenge();
const board = new OnlineLeaderboard();
const music = createMusic($('musicButton'), $('backgroundMusic'));
const raceAudio = createRaceAudio($('soundButton'));
const held = { throttle: new Set(), brake: new Set() }, keysHeld = new Set();
const clearHeld = () => {
  held.throttle.clear(); held.brake.clear(); keysHeld.clear();
  attribute('throttleButton', 'aria-pressed', false); attribute('brakeButton', 'aria-pressed', false);
};
const pedalKeys = new Map([['KeyW', 'throttle'], ['KeyS', 'brake'], ['Space', 'throttle'], ['ArrowRight', 'throttle'], ['ArrowLeft', 'brake']]);
let world, driveClock = 0, resultShown = false, selectedId = null, collisionAt = null, submittingScore = false, startFlashShown = false, finishFlashShown = false;
const namePreference = 'dragondance-driver-name-v1';
function rememberedName() {
  try { return normalizePlayerName(localStorage.getItem(namePreference)); } catch { return ''; }
}
let playerName = rememberedName(), startingRace = false;
$('driverName').value = playerName;
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
function updateStart(now) {
  sequence.tick(now);
  if (sequence.phase === 'go' && !startFlashShown) {
    startFlashShown = true; $('launchFlash').classList.add('flash');
  }
}
function resetRecord() {
  board.offer(null); $('scoreRecord').hidden = $('saveFeedback').hidden = $('retrySaveButton').hidden = true;
  $('saveFeedback').classList.remove('error');
}
function showHowToPlay() {
  if (!world || startingRace || submittingScore || $('leaderboardDialog').open || $('howToPlayDialog').open || sequence.phase !== 'idle') return;
  clearHeld(); $('nameError').hidden = true; $('driverName').removeAttribute('aria-invalid');
  $('howToPlayDialog').showModal();
  (playerName ? $('confirmStartButton') : $('driverName')).focus({ preventScroll:true });
}
async function begin() {
  if (submittingScore || startingRace) return;
  if (!world || $('leaderboardDialog').open || activeDrive() || ['sequence', 'waiting', 'go'].includes(sequence.phase)) return;
  let name;
  try { name = normalizePlayerName($('driverName').value); }
  catch (error) {
    if (!$('howToPlayDialog').open) $('howToPlayDialog').showModal();
    $('nameError').textContent = localizeError(error.message); $('nameError').hidden = false;
    $('driverName').setAttribute('aria-invalid','true'); $('driverName').focus({ preventScroll:true }); return;
  }
  startingRace = true; $('nameError').hidden = true;
  $('confirmStartButton').disabled = $('retryButton').disabled = $('driverName').disabled = $('leaderboardButton').disabled = true;
  $('confirmStartButton').setAttribute('aria-busy','true');
  // Unlock both audio players in the original click, before waiting for a ticket.
  music.start(); raceAudio.start();
  try {
    await board.startRun(name);
    playerName = name; $('driverName').value = name;
    try { localStorage.setItem(namePreference,name); } catch { /* Name remains required for this session. */ }
  } catch (error) {
    music.stop(); raceAudio.stop();
    const message = t('startRoundFailed', { message: localizeError(error.message) });
    const feedback = $('howToPlayDialog').open ? $('nameError') : $('saveFeedback');
    feedback.textContent = message; feedback.hidden = false; feedback.classList.add('error');
    if (feedback === $('saveFeedback')) $('scoreRecord').hidden = false;
    return;
  } finally {
    startingRace = false;
    $('confirmStartButton').disabled = $('retryButton').disabled = $('driverName').disabled = $('leaderboardButton').disabled = false;
    $('confirmStartButton').removeAttribute('aria-busy');
  }
  $('howToPlayDialog').close();
  clearHeld(); resetRecord(); drive.reset(); world.reset(); sequence.start(performance.now());
  startFlashShown = false; $('launchFlash').classList.remove('flash');
  finishFlashShown = false; $('finishFlash').classList.remove('flash');
  resultShown = false; collisionAt = null; $('leaderboardButton').disabled = false;
  $('introPanel').hidden = true; $('resultPanel').hidden = true; $('resultScrim').hidden = true;
  $('liveReaction').hidden = $('brakeGauge').hidden = true;
  $('throttleButton').disabled = false; $('throttleButton').classList.remove('ready', 'down');
  $('brakeButton').disabled = false; $('brakeButton').classList.remove('down');
  $('pedalHint').textContent = t('pedalWait');
  $('brakePedalHint').textContent = t('brakeHintTogether');
  $('resultAnnouncement').textContent = ''; $('throttleButton').focus({ preventScroll: true });
}
function showResult(result) {
  if (!result || resultShown) return;
  resultShown = true; clearHeld(); music.finish(); raceAudio.finish();
  $('leaderboardButton').disabled = false;
  resetRecord(); renderReport(result); board.offer(result, drive);
  $('resultDriver').textContent = playerName;
  $('scoreRecord').hidden = !isScoringResult(result);
  $('introPanel').hidden = $('liveReaction').hidden = $('brakeGauge').hidden = true;
  $('resultPanel').hidden = $('resultScrim').hidden = false;
  fitReport();
  $('throttleButton').disabled = true; $('throttleButton').classList.remove('ready', 'down');
  $('brakeButton').disabled = true; $('brakeButton').classList.remove('down');
  document.body.dataset.phase = 'result'; $('resultPanel').scrollTop = 0;
  $('resultPanel').focus({ preventScroll: true });
  if (isScoringResult(result)) void saveResult();
}
function syncInput() {
  advance();
  drive.setThrottle(held.throttle.size > 0); drive.setBraking(held.brake.size > 0);
  $('throttleButton').classList.toggle('down', drive.phase === 'driving' && drive.throttle);
  $('brakeButton').classList.toggle('down', drive.phase === 'driving' && drive.braking);
}
function press(pedal, source) {
  if (!world || $('leaderboardDialog').open || $('howToPlayDialog').open || resultShown) return;
  if (drive.phase === 'driving') { advance(); held[pedal].add(source); syncInput(); return; }
  if (sequence.phase === 'idle') { showHowToPlay(); return; }
  if (pedal === 'brake') { held.brake.add(source); return; }
  // Refresh the lights before the input, using the same clock as rendering.
  const now = performance.now(); updateStart(now);
  const result = sequence.accelerate(now);
  if (result?.type === 'valid') {
    drive.launch(result.ms); driveClock = now;
    held.throttle.add(source); drive.setThrottle(true); drive.setBraking(held.brake.size > 0);
    $('liveReaction').hidden = $('brakeGauge').hidden = false;
    $('liveSecondary').textContent = t('reactionLive', { ms: result.ms });
    $('pedalHint').textContent = t('pedalNear250');
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
  if (submittingScore || startingRace) return;
  event?.preventDefault(); if (!world) return;
  music.stop();
  raceAudio.stop();
  $('howToPlayDialog').close();
  clearHeld(); resetRecord(); sequence.reset(); drive.reset(); world.reset(); world.setLights(0);
  startFlashShown = false; $('launchFlash').classList.remove('flash');
  finishFlashShown = false; $('finishFlash').classList.remove('flash');
  resultShown = false; collisionAt = null; $('leaderboardButton').disabled = false;
  $('resultPanel').hidden = $('resultScrim').hidden = $('liveReaction').hidden = $('brakeGauge').hidden = true;
  $('introPanel').hidden = false; $('throttleButton').disabled = true;
  $('throttleButton').classList.remove('ready', 'down');
  $('brakeButton').disabled = true; $('brakeButton').classList.remove('down');
  $('pedalHint').textContent = t('pedalWait');
  document.body.dataset.phase = 'idle'; $('resultAnnouncement').textContent = ''; $('startButton').focus({ preventScroll: true });
}
function renderBoard() {
  renderLeaderboard(board.entries, selectedId);
}
let boardLoading = false;
async function refreshBoard() {
  if (boardLoading) return;
  boardLoading = true; $('refreshLeaderboard').disabled = true;
  $('boardStatus').textContent = t('syncing'); $('boardStatus').classList.remove('error');
  try { await board.load(); renderBoard(); $('boardStatus').textContent = t('shared'); }
  catch (error) { $('boardStatus').textContent = localizeError(error.message); $('boardStatus').classList.add('error'); }
  finally { boardLoading = false; $('refreshLeaderboard').disabled = false; }
}
function openBoard() { cancel(); renderBoard(); $('leaderboardDialog').showModal(); refreshBoard(); }
setInterval(() => { if ($('leaderboardDialog').open && !document.hidden) refreshBoard(); }, 15000);
$('startButton').addEventListener('click', showHowToPlay);
$('startForm').addEventListener('submit', event => { event.preventDefault(); void begin(); });
$('howToPlayDialog').addEventListener('cancel', event => { if (startingRace) event.preventDefault(); else clearHeld(); });
$('retryButton').addEventListener('click', begin);
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
  if ($('leaderboardDialog').open || $('howToPlayDialog').open) return;
  if (resultShown) {
    if (event.code === 'Escape') { event.preventDefault(); home(); return; }
    if (event.code === 'Tab') {
      const focusable = [...$('resultPanel').querySelectorAll('button,input')].filter(element => element.getClientRects().length && !element.disabled);
      if (!focusable.length) { event.preventDefault(); return; }
      const first = focusable[0], last = focusable.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === $('resultPanel'))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || document.activeElement === $('resultPanel'))) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  const pedal = pedalKeys.get(event.code);
  if (!pedal || event.target.closest('input,textarea,select,[contenteditable=true],button:not(#throttleButton):not(#brakeButton),a')) return;
  event.preventDefault(); if (event.repeat || keysHeld.has(event.code)) return;
  keysHeld.add(event.code); press(pedal, `key-${event.code}`);
});
window.addEventListener('keyup', event => {
  const pedal = pedalKeys.get(event.code); if (pedal) { keysHeld.delete(event.code); release(pedal, `key-${event.code}`); }
});
window.addEventListener('blur', () => { clearHeld(); if (drive.phase === 'driving') syncInput(); });
document.addEventListener('visibilitychange', () => { if (document.hidden) cancel(); });
$('driverName').addEventListener('input', () => { $('driverName').removeAttribute('aria-invalid'); $('nameError').hidden = true; });
$('retrySaveButton').addEventListener('click', () => { void saveResult(); });
async function saveResult() {
  if (submittingScore || board.saved || !board.result) return;
  submittingScore = true;
  $('saveFeedback').hidden = false; $('saveFeedback').classList.remove('error');
  $('saveFeedback').textContent = t('saving', { name: playerName });
  $('retrySaveButton').hidden = true; $('leaderboardButton').disabled = true;
  $('retryButton').disabled = $('resultHomeButton').disabled = true;
  try {
    const entry = await board.save(); selectedId = entry.id;
    const ranks = [['distanceCm', 'rankDistanceShort'], ['ms', 'rankReactionShort'], ['finishMs', 'rankFinishShort'], ['score', 'rankScoreShort']].map(([metric, label]) => {
      const best = rankLeaderboard(board.entries, metric).find(item => leaderboardIdentity(item) === leaderboardIdentity(entry));
      return t('rankBit', { label: t(label), rank: best.rank });
    });
    $('saveFeedback').textContent = t('saved', { name: entry.name, ranks: ranks.join(' · ') });
    $('boardStatus').textContent = t('shared');
    renderBoard();
  } catch (error) {
    $('saveFeedback').hidden = false; $('saveFeedback').classList.add('error');
    $('saveFeedback').textContent = t('saveFailed', { message: localizeError(error.message) });
    $('retrySaveButton').hidden = false;
  } finally {
    submittingScore = false; $('leaderboardButton').disabled = false;
    $('retryButton').disabled = $('resultHomeButton').disabled = false;
  }
}
const rpm = [...$('rpmStrip').children];
function frame(now) {
  if (world) {
    updateStart(now); advance(now); world.setLights(sequence.lights);
    if (drive.finishCrossed && !finishFlashShown) {
      finishFlashShown = true; $('finishFlash').classList.add('flash');
    }
    const aftermath = world.render(now, drive);
    raceAudio.update(drive, sequence, now);
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
      text('liveLabel', drive.finishCrossed ? t('toBarrier') : t('toFinish'));
      text('liveTime', Math.max(0, remaining).toFixed(2));
      text('liveSecondary', drive.finishCrossed ? t('crossedLive', { time: ((drive.ms + Math.round(drive.finishAt * 1000)) / 1000).toFixed(3) }) : t('reactionLive', { ms: drive.ms }));
      $('throttleButton').disabled = drive.skidded || drive.finishCrossed;
      $('brakeButton').disabled = drive.skidded;
      $('throttleButton').classList.toggle('down', drive.throttle);
      $('brakeButton').classList.toggle('down', drive.braking);
      attribute('throttleButton', 'aria-pressed', drive.throttle);
      attribute('brakeButton', 'aria-pressed', drive.braking);
      text('pedalHint', drive.skidded ? t('pedalLocked') : drive.finishCrossed ? t('pedalCrossed') : drive.speed * 3.6 >= 240 ? t('pedalNear250') : t('pedalHold'));
      text('brakePedalHint', drive.skidded ? t('pedalLocked') : drive.finishCrossed ? t('brakeHintCrossed') : t('brakeHintTogether'));
    }
    const pressure = Math.max(0, drive.brakePressure * 100);
    text('pressureValue', `${pressure.toFixed(0)}%`);
    const fillHeight = `${Math.min(100, pressure / 115 * 100)}%`;
    if ($('pressureFill').style.height !== fillHeight) $('pressureFill').style.height = fillHeight;
    attribute('brakeGauge', 'aria-valuenow', pressure.toFixed(1));
    $('brakeGauge').classList.toggle('danger', pressure >= 100);
    text('pressureHint', pressure >= 100 ? t('pressureDanger') : t('pressureHint'));
    const speed = Math.round((aftermath?.speed ?? drive.speed) * 3.6), driving = drive.phase === 'driving';
    text('speed', String(speed).padStart(3, '0')); text('gear', activeDrive() ? drive.gear : 'N');
    const recentShift = activeDrive() && drive.elapsed - drive.lastShiftAt < .5;
    $('gear').classList.toggle('shifting', recentShift);
    text('gearAction', recentShift ? drive.lastShiftDirection === 'up' ? t('gearUp') : t('gearDown') : t('gearLabel'));
    const rpmValue = (aftermath ? 0 : drive.rpm / 1000).toFixed(1);
    if ($('inputValue').firstChild.textContent !== rpmValue) $('inputValue').firstChild.textContent = rpmValue;
    text('inputLabel', 'RPM');
    $('speed').classList.toggle('overspeed-warning', driving && speed >= 240);
    const bars = activeDrive() ? Math.ceil(drive.rpm / GEARBOX.maxRpm * 12) : ['sequence', 'waiting'].includes(phase) ? 3 : 0;
    rpm.forEach((element, i) => element.classList.toggle('active', i < bars));
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
createScene($('world')).then(scene => {
  world = scene; $('startButton').disabled = false; $('startLabel').textContent = t('startGame');
}).catch(error => {
  console.error('Race scene failed to load', error); $('startLabel').textContent = t('startFailedLabel'); $('loadError').hidden = false;
  $('loadError').textContent = t('loadError');
});
