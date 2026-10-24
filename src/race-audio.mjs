import { t } from './i18n.mjs';
import { GEARBOX } from './core.mjs';

const FILES = Object.freeze({ idle:'f1-v8-idle.wav', engine:'f1-v8-high.wav', tyres:'tyre-scrub.wav',
  shift:'gear-click.wav', impact:'metal-impact.wav', burst:'engine-burst.wav' });
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

// All voices play downloaded recordings. Three loops are reused for a whole race.
export function createRaceAudio(button) {
  const preference = 'dragondance-sfx-enabled-v1';
  let enabled = true, started = false, loading = false, failed = false;
  let context, master, loadPromise, latestDrive, latestSequence, lastMix = -Infinity, shiftCount = 0, impactResult;
  const buffers = new Map(), loops = new Map(), voices = new Set();
  try { enabled = localStorage.getItem(preference) !== 'off'; } catch { /* Optional preference. */ }
  function updateButton() {
    button.setAttribute('aria-pressed', String(enabled));
    button.setAttribute('aria-label', failed ? t('soundRetry') : enabled ? t('soundMute') : t('soundUnmute'));
    button.classList.toggle('muted', !enabled);
    button.querySelector('span').textContent = enabled ? t('soundOn') : t('soundOff');
    button.title = failed ? t('soundRetryTitle') : t('soundTitle');
    button.dataset.audioState = !enabled ? 'muted' : failed ? 'retry' : loading ? 'loading' : buffers.size === 6 ? 'ready' : 'idle';
  }
  function release(voice) {
    if (!voices.delete(voice)) return;
    voice.source.onended = null; voice.source.disconnect(); voice.gain.disconnect();
  }
  function stopVoices(onlyLoops = false) {
    for (const voice of [...voices]) if (!onlyLoops || voice.source.loop) {
      try { voice.source.stop(); } catch { /* Already ended. */ }
      release(voice);
    }
    loops.clear();
  }
  function voice(name, volume = 0, rate = 1, loop = false) {
    if (!enabled || !started || document.hidden || context?.state !== 'running' || !buffers.has(name)) return;
    if (!loop && voices.size >= 8) return;
    const source = context.createBufferSource(), gain = context.createGain();
    source.buffer = buffers.get(name); source.loop = loop; source.playbackRate.value = rate;
    gain.gain.value = volume; source.connect(gain); gain.connect(master);
    const result = { source, gain }; voices.add(result);
    source.onended = () => release(result); source.start(); return result;
  }
  function smooth(parameter, value, time = .035) {
    parameter.setTargetAtTime(value, context.currentTime, time);
  }
  function mix() {
    if (!started || !enabled || document.hidden || context?.state !== 'running' || !latestDrive) return;
    const drive = latestDrive, moving = ['driving','skidding'].includes(drive.phase);
    const waiting = ['sequence','waiting','go'].includes(latestSequence?.phase);
    if (!moving && !waiting) { stopVoices(true); return; }
    for (const name of ['idle','engine','tyres']) if (!loops.has(name)) {
      const loop = voice(name, 0, 1, true); if (loop) loops.set(name, loop);
    }
    const revs = moving ? clamp((drive.rpm - GEARBOX.idleRpm) / (GEARBOX.maxRpm - GEARBOX.idleRpm), 0, 1) : .12;
    const load = drive.throttle && drive.shiftRemaining <= 0 ? 1 : .43;
    const idle = loops.get('idle'), engine = loops.get('engine'), tyres = loops.get('tyres');
    if (idle) {
      smooth(idle.source.playbackRate, moving ? clamp(drive.rpm / 6700, .65, 1.5) : .94);
      smooth(idle.gain.gain, moving ? .13 * (1 - revs * .65) : .07);
    }
    if (engine) {
      smooth(engine.source.playbackRate, moving ? clamp(drive.rpm / 13500, .35, 1.22) : .35, .018);
      smooth(engine.gain.gain, moving ? (.14 + revs * .58) * load : 0);
    }
    if (tyres) {
      // Light scrub accompanies hard braking; a full squeal is reserved for lockup.
      const scrub = moving && drive.speed > 4 ? drive.skidded ? .46
        : drive.braking ? clamp((drive.brakePressure - .5) / .65, 0, 1) * .13 : 0 : 0;
      smooth(tyres.gain.gain, scrub, .04);
      smooth(tyres.source.playbackRate, clamp(.78 + drive.speed / 180, .78, 1.2));
    }
  }
  function unlock() {
    try {
      if (!context) {
        const AudioContext = globalThis.AudioContext || globalThis.webkitAudioContext;
        if (!AudioContext) throw new Error('Audio unavailable');
        context = new AudioContext({ latencyHint:'interactive' });
        master = context.createGain(); master.gain.value = .72;
        const limiter = context.createDynamicsCompressor();
        limiter.threshold.value = -14; limiter.knee.value = 12; limiter.ratio.value = 4;
        limiter.attack.value = .004; limiter.release.value = .16;
        master.connect(limiter); limiter.connect(context.destination);
      }
      context.resume().then(mix).catch(() => { failed = true; updateButton(); });
      if (!loadPromise && buffers.size < Object.keys(FILES).length) {
        loading = true; failed = false; updateButton();
        loadPromise = Promise.allSettled(Object.entries(FILES).filter(([name]) => !buffers.has(name)).map(async ([name,file]) => {
          const response = await fetch(new URL(`../assets/audio/${file}`, import.meta.url), { signal:AbortSignal.timeout(12000) });
          if (!response.ok) throw new Error('Audio request failed');
          buffers.set(name, await context.decodeAudioData(await response.arrayBuffer()));
        })).then(results => {
          loading = false; failed = results.some(result => result.status === 'rejected');
          loadPromise = undefined; updateButton(); mix();
        });
      }
    } catch { failed = true; updateButton(); }
  }
  function suspend() {
    stopVoices(); context?.suspend().catch(() => {});
  }
  button.addEventListener('click', () => {
    if (failed) { enabled = true; failed = false; }
    else enabled = !enabled;
    try { localStorage.setItem(preference, enabled ? 'on' : 'off'); } catch { /* Optional preference. */ }
    if (enabled && started && !document.hidden) unlock(); else suspend();
    updateButton();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) suspend(); else if (started && enabled) unlock();
  });
  updateButton();
  return {
    start() {
      stopVoices(); started = true; shiftCount = 0; impactResult = undefined; latestDrive = undefined; lastMix = -Infinity;
      if (enabled && !document.hidden) unlock();
    },
    update(drive, sequence, now) {
      latestDrive = drive; latestSequence = sequence;
      if (!started) return;
      const changes = drive.gearChanges.length;
      if (changes > shiftCount && !drive.result) voice('shift', .11, drive.lastShiftDirection === 'down' ? .85 : 1.1);
      shiftCount = changes;
      if (drive.result && drive.result !== impactResult) {
        impactResult = drive.result;
        if (['collision','engine-blown'].includes(drive.result.type)) {
          const strength = drive.result.type === 'engine-blown' ? .8 : clamp(drive.outcomeSpeed / 200, .25, 1);
          voice('impact', .65 * strength, .78);
          voice('burst', .5 * strength, .73);
        }
      }
      if (now - lastMix >= 40) { lastMix = now; mix(); }
    },
    finish() { started = false; stopVoices(true); },
    stop() { started = false; latestDrive = undefined; suspend(); },
  };
}
