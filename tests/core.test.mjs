import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveChallenge, RULES, StartSequence, LocalLeaderboard, STORAGE_KEY, overallScore, rankLeaderboard } from '../src/core.mjs';
const near = (actual, expected, tolerance = 1e-7) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const drive = () => { const d = new DriveChallenge(); d.launch(213); return d; };
const successfulRun = (brakeAt = 17.3976) => {
  const d = drive(); d.step(brakeAt); d.setBraking(true); d.step(1);
  d.setBraking(false); d.step(.5); d.setBraking(true); d.step(20); return d;
};
test('the speed cap is 300 km/h and the track ends at 1250 m', () => {
  const d = drive(); d.step(10); near(d.speed * 3.6, 300); assert.equal(RULES.distance, 1250);
  d.step(20); assert.equal(d.result.type, 'collision'); near(d.distance, 1260);
  assert.equal(RULES.roadblockGap, 10); assert.equal(d.result.offsetCm, 1000);
  near(d.result.stats.outcomeSpeed, 300);
});
test('first braking permanently cuts propulsion; release only coasts and unloads pressure', () => {
  const d = drive(); d.step(10); d.setBraking(true); d.step(.5); d.setBraking(false);
  const speed = d.speed, pressure = d.brakePressure; d.step(1);
  assert.equal(d.propulsionCut, true); near(d.speed, speed - RULES.coastDeceleration);
  assert.ok(d.brakePressure < pressure); d.setBraking(true); d.step(.1); d.setBraking(false);
  const second = d.speed; d.step(1); assert.ok(d.speed < second);
});

test('pressure builds promptly while 100% remains below the locking threshold', () => {
  const d = drive(); d.step(10); d.setBraking(true); d.step(1);
  assert.ok(d.brakePressure > .83 && d.brakePressure < .84);
  assert.equal(d.skidded, false); assert.ok(d.speed > 0);
});
test('100% pressure no longer triggers a skid; the new lock boundary is 115%', () => {
  const d = drive(); d.step(10); d.setBraking(true);
  while (d.brakePressure < 1.01 && d.phase === 'driving') d.step(.001);
  assert.equal(d.skidded, false); assert.ok(d.brakePressure > 1);
  while (d.phase === 'driving') d.step(.001);
  assert.equal(d.phase, 'skidding'); near(d.peakPressure, 1.15);
  assert.ok(d.history.some(sample => Math.abs(sample.pressure - 115) < 1e-7));
  d.step(20); assert.equal(d.result.type, 'skid');
});
test('pulsed manual braking can produce a valid stop immediately before the finish line', () => {
  const d = successfulRun(); assert.equal(d.result.type, 'valid');
  assert.ok(d.result.distanceCm < 20); assert.ok(d.distance < RULES.distance);
  near(d.result.stats.initialSpeed, 300); near(d.result.stats.brakeDistance, d.distance - d.firstBrakeDistance);
  near(d.result.stats.brakeTime, d.elapsed - d.firstBrakeAt);
  assert.equal(d.result.totalMs, 213 + Math.round(d.elapsed * 1000));
  near(d.history.at(-1).speed, 0); assert.ok(d.history.some(sample => sample.pressure < 70 && sample.time > 1.5));
});

test('the car can enter the runoff but a stop beyond the finish line is invalid', () => {
  const crossing = drive(); crossing.step(19.2);
  assert.equal(crossing.phase, 'driving'); assert.equal(crossing.result, null);
  assert.ok(crossing.distance > 1250 && crossing.distance < 1260);
  const d = successfulRun(17.4336);
  assert.equal(d.result.type, 'overshoot'); assert.equal(d.skidded, false);
  assert.ok(d.distance > 1250 && d.distance < 1260);
  assert.equal(d.result.offsetCm, 290); assert.equal(d.result.distanceCm, 290);
  near(d.history.at(-1).speed, 0);
  const board = new LocalLeaderboard({ getItem: () => null }); board.offer(d.result); board.agree();
  assert.throws(() => board.save('越线车手'), /有效/);
});
test('collision never tunnels through the row at low or high render rates or long frames', () => {
  for (const dt of [1 / 30, 1 / 60, 1 / 144, .8, 25]) {
    const d = drive(); for (let i = 0; i < 10000 && !d.result; i++) d.step(dt);
    assert.equal(d.result.type, 'collision'); near(d.distance, 1260); near(d.elapsed, 19.28666666666667);
  }
});
test('identical timed inputs give the same braking, coasting and skid outcomes across frame rates', () => {
  const run = (dt, skid = false) => {
    const d = drive();
    const advance = seconds => { let remaining = seconds; while (remaining > 1e-9) { const step = Math.min(dt, remaining); d.step(step); remaining -= step; } };
    advance(skid ? 16 : 17.3976); d.setBraking(true); advance(skid ? 20 : 1);
    if (!skid) { d.setBraking(false); advance(.5); d.setBraking(true); advance(20); }
    return d;
  };
  for (const skid of [false, true]) {
    const baseline = run(1 / 60, skid);
    for (const dt of [1 / 30, 1 / 144, .7]) {
      const d = run(dt, skid); assert.equal(d.result.type, baseline.result.type);
      near(d.distance, baseline.distance, 1e-6); near(d.elapsed, baseline.elapsed, 1e-6);
      near(d.peakPressure, baseline.peakPressure, 1e-7);
    }
  }
});
test('collision during braking records impact speed, without a fabricated zero-speed endpoint', () => {
  const d = drive(); d.step(18); d.setBraking(true); d.step(10);
  assert.equal(d.result.type, 'collision'); assert.ok(d.result.stats.outcomeSpeed > 0);
  near(d.history.at(-1).speed, d.result.stats.outcomeSpeed); assert.ok(d.result.stats.brakeDistance > 0);
});
test('launch controls reject early inputs and time out after ten seconds', () => {
  const early = new StartSequence(() => 0); early.start(0); early.tick(2000); assert.equal(early.accelerate(2000).type, 'false-start');
  const sequence = new StartSequence(() => 0); sequence.start(0); sequence.tick(5700);
  assert.equal(sequence.phase, 'go'); assert.equal(sequence.lights, 0);
  sequence.tick(15701); assert.equal(sequence.result.type, 'timeout');
});
test('restart resets the power cut, telemetry and skid state', () => {
  const d = successfulRun(); d.reset(); assert.equal(d.propulsionCut, false);
  assert.equal(d.firstBrakeAt, null); assert.deepEqual(d.history, []); assert.equal(d.result, null);
  d.launch(100); d.step(1); assert.ok(d.speed > 0);
});
test('new local results require consent, valid name and a valid stop; legacy data is retained', () => {
  const storage = new Map([['lights-out-braking-leaderboard-v5', 'legacy-data'], ['lights-out-roadblock-leaderboard-v6', 'roadblock-data']]);
  const board = new LocalLeaderboard({ getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) });
  const result = successfulRun().result; board.offer(result);
  assert.throws(() => board.save('车手'), /同意/); board.agree(); assert.throws(() => board.save('   '), /名字/);
  const entry = board.save('<b>车手</b>', 1000); assert.equal(entry.name, '<b>车手</b>');
  assert.ok(storage.has(STORAGE_KEY)); assert.equal(storage.get('lights-out-braking-leaderboard-v5'), 'legacy-data');
  assert.equal(storage.get('lights-out-roadblock-leaderboard-v6'), 'roadblock-data');
  assert.throws(() => board.save('车手'), /已经/); board.offer({ ...result, type: 'skid' }); board.agree(); assert.throws(() => board.save('车手'), /有效/);
  const reloaded = new LocalLeaderboard({ getItem: key => storage.get(key) }); assert.equal(reloaded.entries.length, 1);
  assert.ok(overallScore(entry) > 0 && overallScore(entry) <= 100);
});

test('distance, reaction and completion have independent driver rankings', () => {
  const entries = [
    { id: 'zhu', name: '朱', distanceCm: 10, ms: 250, totalMs: 22000, at: 1 },
    { id: 'zhu2', name: '住', distanceCm: 30, ms: 230, totalMs: 20300, at: 2 },
    { id: 'wang', name: '王', distanceCm: 40, ms: 180, totalMs: 20900, at: 3 },
  ];
  const order = metric => rankLeaderboard(entries, metric).map(entry => entry.name);
  assert.deepEqual(order('distanceCm'), ['朱', '住', '王']);
  assert.deepEqual(order('ms'), ['王', '住', '朱']);
  assert.deepEqual(order('totalMs'), ['住', '王', '朱']);
  assert.deepEqual(entries.map(entry => entry.id), ['zhu', 'zhu2', 'wang']);
});

test('each driver uses their own best round per metric; equal results share rank', () => {
  const entries = [
    { id: 'old', name: '朱', distanceCm: 10, ms: 250, totalMs: 22000, at: 1 },
    { id: 'new', name: '朱', distanceCm: 20, ms: 150, totalMs: 21000, at: 2 },
    { id: 'tie', name: '住', distanceCm: 10, ms: 180, totalMs: 21000, at: 3 },
    { id: 'last', name: '王', distanceCm: 30, ms: 190, totalMs: 23000, at: 4 },
  ];
  const distance = rankLeaderboard(entries, 'distanceCm');
  assert.deepEqual(distance.map(entry => [entry.name, entry.rank]), [['朱', 1], ['住', 1], ['王', 3]]);
  assert.equal(distance[0].id, 'old');
  assert.equal(rankLeaderboard(entries, 'ms')[0].id, 'new');
  assert.equal(rankLeaderboard(entries, 'totalMs')[0].id, 'new');
});

test('overall score ranks high to low, keeps each driver best and shares displayed ties', () => {
  const entries = [
    { id: 'slow', name: '朱', distanceCm: 30, ms: 300, totalMs: 24000, at: 1 },
    { id: 'fast', name: '朱', distanceCm: 10, ms: 180, totalMs: 21000, at: 2 },
    { id: 'tie', name: '住', distanceCm: 10, ms: 180, totalMs: 21000, at: 3 },
    { id: 'third', name: '王', distanceCm: 30, ms: 300, totalMs: 24000, at: 4 },
  ];
  const scored = rankLeaderboard(entries, 'score');
  assert.deepEqual(scored.map(entry => [entry.id, entry.rank]), [['fast', 1], ['tie', 1], ['third', 3]]);
  assert.equal(scored[0].score, Math.round(overallScore(entries[1]) * 100) / 100);
  assert.ok(scored[0].score > scored[2].score);
});
