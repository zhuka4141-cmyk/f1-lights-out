import test from 'node:test';
import assert from 'node:assert/strict';
import { createRaceAudio } from '../src/race-audio.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));
function harness(t, failedFile) {
  const originals = new Map(['document','localStorage','AudioContext','fetch'].map(key => [key,Object.getOwnPropertyDescriptor(globalThis,key)]));
  t.after(() => { for (const [key,descriptor] of originals) {
    if (descriptor) Object.defineProperty(globalThis,key,descriptor); else delete globalThis[key];
  } });
  const document = new EventTarget(); document.hidden = false;
  const button = new EventTarget(), attributes = new Map(), classes = new Set(), label = {};
  button.setAttribute = (key,value) => attributes.set(key,value); button.dataset = {};
  button.classList = { toggle(key,on) { if (on) classes.add(key); else classes.delete(key); } };
  button.querySelector = () => label;
  const preferences = new Map(), sources = [], requests = [], contexts = [];
  const param = () => ({ value:0, setTargetAtTime(value) { this.value = value; } });
  const node = () => ({ connect(target) { this.output = target; }, disconnect() {}, gain:param() });
  class AudioContext {
    constructor() { this.state = 'suspended'; this.currentTime = 1; this.destination = node(); contexts.push(this); }
    async resume() { this.state = 'running'; }
    async suspend() { this.state = 'suspended'; }
    createGain() { return node(); }
    createDynamicsCompressor() { return { ...node(), ...Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key => [key,param()])) }; }
    async decodeAudioData(bytes) { return { name:new TextDecoder().decode(bytes) }; }
    createBufferSource() {
      const source = { ...node(), playbackRate:param(), start() { sources.push(this); }, stop() { this.stopped = true; } };
      return source;
    }
  }
  let fail = failedFile;
  Object.assign(globalThis, { document, AudioContext,
    localStorage:{ getItem:key => preferences.get(key), setItem:(key,value) => preferences.set(key,value) },
    fetch:async url => {
      const file = new URL(url).pathname.split('/').at(-1); requests.push(file);
      if (file === fail) { fail = undefined; throw new Error('Temporary offline'); }
      return { ok:true, arrayBuffer:async () => new TextEncoder().encode(file).buffer };
    },
  });
  const audio = createRaceAudio(button);
  const drive = { phase:'driving', rpm:14000, speed:40, throttle:true, shiftRemaining:0,
    gearChanges:[], braking:false, skidded:false, brakePressure:0, outcomeSpeed:0 };
  const sequence = { phase:'result' };
  const loops = () => sources.filter(source => source.loop && !source.stopped);
  const byFile = file => sources.filter(source => source.buffer.name === file);
  const hide = hidden => { document.hidden = hidden; document.dispatchEvent(new Event('visibilitychange')); };
  return { audio, drive, sequence, button, label, contexts, requests, sources, loops, byFile, preferences, hide,
    click:() => button.dispatchEvent(new Event('click')) };
}

test('recordings load only after start and the same loop voices follow RPM, torque cuts and tyre lockup', async t => {
  const h = harness(t);
  h.audio.update(h.drive,h.sequence,0);
  assert.equal(h.contexts.length,0); assert.equal(h.requests.length,0);
  h.audio.start(); h.audio.update(h.drive,h.sequence,1); await flush();
  assert.equal(h.button.dataset.audioState,'ready'); assert.equal(h.requests.length,6);
  assert.equal(h.loops().length,3);
  const engine = h.byFile('f1-v8-high.wav')[0], sourceCount = h.sources.length;
  const before = engine.playbackRate.value, loadedVolume = engine.output.gain.value;
  h.drive.rpm = 9500; h.drive.shiftRemaining = .09;
  h.audio.update(h.drive,h.sequence,60);
  assert.ok(engine.playbackRate.value < before);
  assert.ok(engine.output.gain.value < loadedVolume);
  h.drive.skidded = true; h.drive.phase = 'skidding';
  for (let i = 0; i < 60; i++) h.audio.update(h.drive,h.sequence,100+i*17);
  assert.equal(h.sources.length,sourceCount); assert.equal(h.loops().length,3);
  assert.ok(h.byFile('tyre-scrub.wav')[0].output.gain.value > 0);
});

test('gear events and explosions play once, and failure silences the running engine', async t => {
  const h = harness(t); h.audio.start(); h.audio.update(h.drive,h.sequence,0); await flush();
  h.drive.gearChanges.push({ direction:'up' }); h.drive.lastShiftDirection = 'up';
  h.audio.update(h.drive,h.sequence,100); h.audio.update(h.drive,h.sequence,120);
  assert.equal(h.byFile('gear-click.wav').length,1);
  h.drive.result = { type:'engine-blown' }; h.drive.outcomeSpeed = 250;
  h.drive.phase = 'stopped'; h.drive.speed = 0;
  h.audio.update(h.drive,h.sequence,200);
  for (let i = 0; i < 60; i++) h.audio.update(h.drive,h.sequence,250+i*17);
  assert.equal(h.byFile('engine-burst.wav').length,1);
  assert.equal(h.byFile('metal-impact.wav').length,1); assert.equal(h.loops().length,0);
  h.audio.finish(); assert.equal(h.byFile('engine-burst.wav')[0].stopped,undefined);
  h.audio.start(); h.audio.update({ ...h.drive, result:undefined, phase:'driving' },h.sequence,2000); await flush();
  assert.ok(h.byFile('engine-burst.wav')[0].stopped);
});

test('mute, page visibility and home stop every old voice and preserve the mute choice', async t => {
  const h = harness(t); h.audio.start(); h.audio.update(h.drive,h.sequence,0); await flush();
  h.hide(true); assert.equal(h.loops().length,0); assert.equal(h.contexts[0].state,'suspended');
  h.hide(false); await flush(); assert.equal(h.loops().length,3);
  h.click(); assert.equal(h.button.dataset.audioState,'muted'); assert.equal(h.loops().length,0);
  assert.equal(h.preferences.get('dragondance-sfx-enabled-v1'),'off');
  h.hide(true); h.hide(false); await flush(); assert.equal(h.loops().length,0);
  h.click(); await flush(); assert.equal(h.loops().length,3); assert.equal(h.requests.length,6);
  h.audio.stop(); h.hide(true); h.hide(false); await flush();
  assert.equal(h.loops().length,0); assert.ok(h.sources.every(source => source.stopped));
});

test('a missing recording leaves gameplay usable and retry downloads only the failed file', async t => {
  const h = harness(t,'tyre-scrub.wav'); h.audio.start(); h.audio.update(h.drive,h.sequence,0); await flush();
  assert.equal(h.button.dataset.audioState,'retry'); assert.equal(h.loops().length,2);
  h.click(); await flush();
  assert.equal(h.button.dataset.audioState,'ready'); assert.equal(h.loops().length,3);
  assert.equal(h.requests.length,7); assert.equal(h.contexts.length,1);
});

test('finishing while recordings load cannot start stale engine audio', async t => {
  const h = harness(t); h.audio.start(); h.audio.update(h.drive,h.sequence,0); h.audio.finish();
  await flush(); assert.equal(h.button.dataset.audioState,'ready'); assert.equal(h.sources.length,0);
});
