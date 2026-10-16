import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveChallenge, RULES, GEARBOX, StartSequence, LocalLeaderboard, STORAGE_KEY, overallScore, rankLeaderboard, isScoringResult } from '../src/core.mjs';
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);
const drive = () => { const d = new DriveChallenge(); d.launch(213); return d; };
const advance = (d, seconds, dt = .05) => {
  let remaining = seconds;
  while (remaining > 1e-9) { const slice = Math.min(dt, remaining); d.step(slice); remaining -= slice; }
};
const crossLine = () => {
  const d = drive(); d.setThrottle(true); d.step(6.8); d.setThrottle(false);
  for (let i = 0; i < 10000 && !d.finishCrossed && !d.result; i++) {
    if (d.speed * 3.6 < 240) d.setThrottle(true);
    if (d.speed * 3.6 > 248) d.setThrottle(false);
    d.step(.01);
  }
  assert.equal(d.finishCrossed, true); assert.equal(d.result, null); return d;
};
const stop = (d, coast = 2.45, dt = .05) => {
  advance(d, coast, dt); d.setBraking(true); advance(d, .7, dt);
  d.setBraking(false); advance(d, .7, dt); d.setBraking(true); advance(d, 20, dt); return d;
};
const successfulRun = (coast = 2.45) => stop(crossLine(), coast);
const adapter = (storage = new Map()) => ({ getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) });

test('1250 m finish and 1500 m obstacle with a 250 km/h ceiling', () => {
  assert.equal(RULES.distance, 1250); assert.equal(RULES.roadblockGap, 250); near(RULES.maxSpeed * 3.6, 250);
});
test('manual throttle is required and releasing it coasts, with no automatic acceleration', () => {
  const d = drive(); d.step(2); near(d.speed, 0); near(d.distance, 0); assert.equal(d.result, null);
  d.setThrottle(true); d.step(1); near(d.speed, 10); d.setThrottle(false); d.step(1); near(d.speed, 6);
  d.setThrottle(true); d.step(.1); near(d.speed, 7);
});
test('250 is safe but further throttle blows the engine across frame rates', () => {
  const toMax = RULES.maxSpeed / RULES.acceleration + 7 * GEARBOX.shiftDuration * (1 + GEARBOX.shiftDeceleration / RULES.acceleration);
  const d = drive(); d.setThrottle(true); d.step(toMax);
  near(d.speed * 3.6, 250); assert.equal(d.result, null); d.setThrottle(false); d.step(.1); assert.equal(d.result, null);
  const baseline = drive(); baseline.setThrottle(true); baseline.step(10);
  for (const dt of [1 / 30, 1 / 60, 1 / 144, .8, 30]) {
    const run = drive(); run.setThrottle(true); advance(run, 10, dt);
    assert.equal(run.result.type, 'engine-blown'); near(run.result.stats.outcomeSpeed, 250);
    near(run.distance, baseline.distance); near(run.elapsed, toMax); assert.equal(run.result.finishMs, null);
    assert.deepEqual(run.gearChanges.map(shift => shift.to), [2, 3, 4, 5, 6, 7, 8]);
    run.gearChanges.forEach((shift, i) => near(shift.speed, GEARBOX.upshiftKmh[i]));
    assert.equal(overallScore(run.result), 0);
  }
});
test('upshifts cut torque briefly, reduce road speed and drop actual engine rpm', () => {
  const d = drive(); d.setThrottle(true); d.step(1.5);
  assert.equal(d.gear, 2); near(d.speed * 3.6, 54); near(d.shiftRemaining, .09);
  assert.ok(d.rpm < 9000); assert.ok(d.rpm > GEARBOX.idleRpm);
  d.step(.045); near(d.speed, 15 - .8 * .045); assert.equal(d.gear, 2);
  d.step(.045); near(d.shiftRemaining, 0); const speed = d.speed;
  d.step(.1); near(d.speed, speed + 1); assert.equal(d.throttle, true);
});

test('automatic downshifts increase engine braking, raise rpm and reach first gear at a stop', () => {
  for (const dt of [1 / 30, 1 / 144, .8, 100]) {
    const d = drive(); d.gear = 8; d.speed = 240 / 3.6;
    advance(d, 39 / 3.6 / 2.6, dt);
    assert.equal(d.gear, 7); near(d.speed * 3.6, 201);
    assert.equal(d.lastShiftDirection, 'down');
    assert.ok(d.rpm > d.speed * 3.6 / GEARBOX.upshiftKmh[7] * GEARBOX.shiftRpm);
    d.step(.1); near(d.speed, 201 / 3.6 - 2.75 * .1);
    advance(d, 100, dt); near(d.speed, 0); assert.equal(d.gear, 1); assert.equal(d.result, null);
    assert.deepEqual(d.gearChanges.map(shift => shift.to), [7, 6, 5, 4, 3, 2, 1]);
  }
});

test('shift thresholds prevent gear hunting when the throttle is released and reapplied', () => {
  const d = drive(); d.setThrottle(true); d.step(1.5); d.setThrottle(false); d.step(.2);
  assert.equal(d.gear, 2); d.setThrottle(true); d.step(.15);
  assert.equal(d.gear, 2); assert.equal(d.gearChanges.length, 1);
});

test('stopping before the line keeps the race running and permits another launch', () => {
  for (const brake of [false, true]) {
    const d = drive(); d.setThrottle(true); d.step(.1); d.setThrottle(false); if (brake) d.setBraking(true); d.step(2);
    near(d.speed, 0); assert.equal(d.phase, 'driving'); assert.equal(d.result, null);
    assert.equal(d.finishCrossed, false); assert.equal(d.finishAt, null); near(d.elapsed, 2.1);
    const stoppedAt = d.distance; assert.ok(stoppedAt > 0); d.step(3);
    near(d.distance, stoppedAt); near(d.elapsed, 5.1);
    assert.equal(isScoringResult(d.result), false); assert.equal(overallScore(d.result), 0);
    const board = new LocalLeaderboard(adapter()); board.offer(d.result); board.agree();
    assert.throws(() => board.save('提前停车'), /有效/);
    d.setThrottle(true); d.setBraking(false); d.step(.5);
    near(d.speed, 5); assert.ok(d.distance > stoppedAt); assert.equal(d.result, null);
  }
});

test('stopping just before the line does not record a time until the car crosses', () => {
  for (const dt of [1 / 30, 1 / 144, .8, 20]) {
    const d = drive(); d.distance = 1249; d.speed = 1; d.elapsed = 21;
    advance(d, 10, dt); near(d.speed, 0); near(d.elapsed, 31);
    assert.equal(d.finishCrossed, false); assert.equal(d.finishAt, null); assert.equal(d.result, null);
    const gap = RULES.distance - d.distance;
    d.setThrottle(true); d.step(1);
    assert.equal(d.finishCrossed, true); assert.equal(d.throttle, false); assert.equal(d.result, null);
    near(d.finishAt, 31 + Math.sqrt(2 * gap / RULES.acceleration));
    d.setBraking(true); d.step(10);
    assert.equal(d.result.type, 'valid'); assert.equal(isScoringResult(d.result), true);
    assert.equal(d.result.finishMs, 213 + Math.round(d.finishAt * 1000));
  }
});
test('crossing records its own instant and permanently cuts throttle', () => {
  const d = crossLine(); assert.ok(d.finishAt > 18); assert.ok(d.distance > 1250);
  assert.equal(d.throttle, false); assert.equal(d.propulsionCut, true); assert.equal(d.setThrottle(true), false);
  const finish = d.finishAt, speed = d.speed, deceleration = RULES.coastDeceleration + GEARBOX.engineBraking[d.gear - 1];
  d.step(1); near(d.speed, speed - deceleration); near(d.finishAt, finish);
});
test('crossing is solved within acceleration, coasting and braking slices', () => {
  const a = drive(); a.distance = 1249; a.speed = 30; a.gear = 3; a.setThrottle(true); a.step(.1);
  near(a.finishAt, 2 / (Math.sqrt(920) + 30)); assert.equal(a.throttle, false);
  const c = drive(); c.distance = 1249; c.speed = 30; c.gear = 3; c.step(.1);
  near(c.finishAt, 2 / (30 + Math.sqrt(900 - 2 * (RULES.coastDeceleration + GEARBOX.engineBraking[2]))));
  const b = drive(); b.distance = 1249; b.speed = 30; b.gear = 3; b.setBraking(true); b.step(.1);
  assert.equal(b.finishCrossed, true); assert.ok(b.finishAt > 1 / 30 && b.finishAt < .04);
});
test('pulsed braking can stop less than one metre before the roadblock', () => {
  const d = successfulRun(); assert.equal(d.result.type, 'valid'); assert.equal(isScoringResult(d.result), true);
  assert.ok(d.distance > 1250 && d.distance < 1500); assert.ok(d.result.distanceCm < 100);
  assert.equal(d.result.offsetCm, Math.round((d.distance - 1500) * 100));
  assert.equal(d.result.finishMs, 213 + Math.round(d.finishAt * 1000));
  assert.equal(d.result.totalMs, 213 + Math.round(d.elapsed * 1000));
  assert.ok(d.result.finishMs < d.result.totalMs); near(d.history.at(-1).speed, 0);
  near(d.result.stats.brakeDistance, d.distance - d.firstBrakeDistance);
});
test('score uses finish time and obstacle distance, never total stop duration', () => {
  const r = successfulRun().result;
  near(overallScore(r), overallScore({ ...r, totalMs: r.totalMs + 100000 }));
  assert.ok(overallScore({ ...r, finishMs: r.finishMs - 1000 }) > overallScore(r));
  assert.ok(overallScore({ ...r, distanceCm: 10, offsetCm: -10 }) > overallScore(r));
  assert.ok(overallScore({ ...r, distanceCm: 1000, offsetCm: -1000 }) < overallScore(r));
  assert.equal(overallScore({ ...r, finishMs: null }), 0);
});
test('independent throttle and brake work together and releasing one preserves the other', () => {
  const d = drive(); d.setThrottle(true); d.step(6.8); d.setBraking(true); d.step(.5);
  const brakeOnly = drive(); brakeOnly.setThrottle(true); brakeOnly.step(6.8); brakeOnly.setThrottle(false); brakeOnly.setBraking(true); brakeOnly.step(.5);
  assert.equal(d.throttle, true); assert.equal(d.braking, true); assert.equal(d.propulsionCut, false);
  assert.ok(d.speed > brakeOnly.speed); assert.ok(d.speed < 68);
  d.setBraking(false); const speed = d.speed, pressure = d.brakePressure; d.step(.1);
  near(d.speed, speed + RULES.acceleration * .1); assert.ok(d.brakePressure < pressure);
  d.setBraking(true); d.setThrottle(false); assert.equal(d.braking, true); assert.equal(d.throttle, false);
  d.setBraking(false); const coastingSpeed = d.speed, deceleration = RULES.coastDeceleration + GEARBOX.engineBraking[d.gear - 1];
  d.step(.1); near(d.speed, coastingSpeed - deceleration * .1);
});
test('holding both pedals before moving keeps the car still and releasing the brake launches it', () => {
  const d = drive(); d.setThrottle(true); d.setBraking(true); d.step(2);
  near(d.speed, 0); near(d.distance, 0); assert.equal(d.result, null); assert.equal(d.skidded, false);
  d.setBraking(false); d.step(.5); near(d.speed, 5); assert.equal(d.throttle, true);
});
test('simultaneous pedals integrate consistently across frame rates', () => {
  const run = dt => {
    const d = drive(); d.setThrottle(true); advance(d, 6, dt); d.setBraking(true); advance(d, .4, dt);
    d.setBraking(false); advance(d, .2, dt); d.setThrottle(false); d.setBraking(true); advance(d, .3, dt); return d;
  };
  const baseline = run(.05);
  for (const dt of [1 / 30, 1 / 144, .7, 25]) {
    const d = run(dt); near(d.speed, baseline.speed); near(d.distance, baseline.distance); near(d.brakePressure, baseline.brakePressure);
  }
});
test('crossing while both pedals are held cuts only propulsion and preserves braking', () => {
  const d = drive(); d.distance = 1249; d.speed = 30; d.setThrottle(true); d.setBraking(true); d.step(.1);
  assert.equal(d.finishCrossed, true); assert.equal(d.throttle, false); assert.equal(d.braking, true); assert.ok(d.brakePressure > 0);
});
test('acceleration telemetry records speed and pedal changes and ends at the exact finish instant', () => {
  const d = crossLine(); const history = d.getStats().accelerationHistory;
  near(history[0].time, 0); near(history[0].speed, 0); near(history.at(-1).time, d.finishAt);
  assert.ok(history.some(s => s.throttle === 100)); assert.ok(history.some(s => s.throttle === 0));
  assert.ok(history.every(s => s.speed <= 250 + 1e-7));
  d.step(5); assert.deepEqual(d.getStats().accelerationHistory, history);
  const engine = drive(); engine.setThrottle(true); engine.step(10); near(engine.result.stats.accelerationHistory.at(-1).speed, 250);
  engine.reset(); assert.deepEqual(engine.accelerationHistory, []);
});
test('faster pressure reaches 100 percent in about 0.7 s but still locks only at 115 percent', () => {
  const d = drive(); d.setThrottle(true); d.step(6.8); d.setThrottle(false); d.setBraking(true); d.step(.7);
  assert.ok(d.brakePressure > .99 && d.brakePressure < 1); assert.equal(d.skidded, false);
  while (d.brakePressure < 1.01 && d.phase === 'driving') d.step(.001);
  assert.equal(d.skidded, false); assert.ok(d.brakePressure > 1); d.step(20);
  assert.equal(d.result.type, 'skid'); near(d.peakPressure, 1.15);
  assert.ok(d.history.some(s => Math.abs(s.pressure - 115) < 1e-7));
});
test('the car cannot tunnel through the obstacle during low frame rates or long frames', () => {
  const expected = crossLine(); expected.step(100);
  for (const dt of [1 / 30, 1 / 60, 1 / 144, .8, 100]) {
    const d = crossLine(); advance(d, 100, dt);
    assert.equal(d.result.type, 'collision'); near(d.distance, 1500); near(d.elapsed, expected.elapsed);
    assert.equal(d.result.offsetCm, 0); assert.equal(overallScore(d.result), 0);
  }
});
test('collision telemetry retains the actual impact speed', () => {
  const d = crossLine(); d.step(3); d.setBraking(true); d.step(10);
  assert.equal(d.result.type, 'collision'); assert.ok(d.result.stats.outcomeSpeed > 0);
  near(d.history.at(-1).speed, d.result.stats.outcomeSpeed);
});
test('identical brake inputs remain stable across render rates', () => {
  const baseline = successfulRun();
  for (const dt of [1 / 30, 1 / 144, .7, 25]) {
    const d = stop(crossLine(), 2.45, dt); assert.equal(d.result.type, baseline.result.type);
    near(d.distance, baseline.distance, 1e-6); near(d.elapsed, baseline.elapsed, 1e-6);
    assert.equal(d.result.finishMs, baseline.result.finishMs); near(d.peakPressure, baseline.peakPressure);
  }
});
test('a centimetre-rounded stop just before the obstacle saves but failures never do', () => {
  let low = 2.45, high = 2.47;
  for (let i = 0; i < 40; i++) { const mid = (low + high) / 2; if (successfulRun(mid).distance < 1499.999) low = mid; else high = mid; }
  const d = successfulRun(low); assert.equal(d.result.type, 'valid'); assert.equal(d.result.offsetCm, 0);
  const board = new LocalLeaderboard(adapter()); board.offer(d.result); board.agree(); board.save('极限');
  for (const type of ['collision', 'skid', 'engine-blown', 'short-stop', 'false-start', 'timeout', 'cancelled', 'overshoot']) {
    const r = { ...d.result, type }; assert.equal(isScoringResult(r), false); assert.equal(overallScore(r), 0);
    board.offer(r); board.agree(); assert.throws(() => board.save('失败'), /有效/);
  }
  assert.equal(isScoringResult({ ...d.result, offsetCm: 1, distanceCm: 1 }), false);
  assert.equal(isScoringResult({ ...d.result, offsetCm: -25001, distanceCm: 25001 }), false);
});
test('consented records survive reload and old rules remain in separate storage', () => {
  const storage = new Map([['lights-out-250-finish-line-leaderboard-v8', 'legacy'], ['lights-out-250-roadblock-leaderboard-v9', 'manual-legacy']]), store = adapter(storage);
  const board = new LocalLeaderboard(store), result = successfulRun().result; board.offer(result);
  assert.throws(() => board.save('车手'), /同意/); board.agree(); assert.throws(() => board.save('   '), /名字/);
  const entry = board.save('<b>车手</b>', 1000); assert.equal(entry.finishMs, result.finishMs);
  assert.equal(storage.get('lights-out-250-finish-line-leaderboard-v8'), 'legacy');
  assert.equal(storage.get('lights-out-250-roadblock-leaderboard-v9'), 'manual-legacy');
  assert.deepEqual(new LocalLeaderboard(store).entries, [entry]); assert.throws(() => board.save('重复'), /已经/);
  for (const m of ['distanceCm', 'ms', 'finishMs', 'score']) assert.equal(rankLeaderboard([entry], m)[0].rank, 1);
  storage.set(STORAGE_KEY, JSON.stringify([entry, { ...entry, id: 'invalid', finishMs: null }]));
  assert.deepEqual(new LocalLeaderboard(store).entries, [entry]);
});
test('each metric selects its own best driver round and preserves ties', () => {
  const r = successfulRun().result;
  const entries = [
    { ...r, id: 'old', name: '朱', distanceCm: 10, offsetCm: -10, ms: 250, finishMs: 24000, at: 1 },
    { ...r, id: 'new', name: '朱', distanceCm: 20, offsetCm: -20, ms: 150, finishMs: 22000, at: 2 },
    { ...r, id: 'tie', name: '住', distanceCm: 10, offsetCm: -10, ms: 180, finishMs: 22000, at: 3 },
    { ...r, id: 'last', name: '王', distanceCm: 30, offsetCm: -30, ms: 190, finishMs: 23000, at: 4 },
  ];
  assert.deepEqual(rankLeaderboard(entries, 'distanceCm').map(e => [e.name, e.rank]), [['朱', 1], ['住', 1], ['王', 3]]);
  assert.equal(rankLeaderboard(entries, 'distanceCm')[0].id, 'old');
  assert.equal(rankLeaderboard(entries, 'ms')[0].id, 'new');
  assert.equal(rankLeaderboard(entries, 'finishMs')[0].id, 'new');
  const scored = rankLeaderboard(entries, 'score'); assert.equal(scored[0].id, 'tie');
  assert.equal(scored.find(e => e.name === '朱').id, 'new'); assert.ok(scored[0].score > scored.at(-1).score);
  const tiedScores = rankLeaderboard([entries[1], { ...entries[1], id: 'same', name: '同分', at: 5 }], 'score');
  assert.deepEqual(tiedScores.map(e => e.rank), [1, 1]);
});
test('start inputs still reject false starts and time out after ten seconds', () => {
  const early = new StartSequence(() => 0); early.start(0); early.tick(2000); assert.equal(early.accelerate(2000).type, 'false-start');
  const s = new StartSequence(() => 0); s.start(0); s.tick(5700); assert.equal(s.phase, 'go'); assert.equal(s.lights, 0);
  s.tick(15701); assert.equal(s.result.type, 'timeout');
});
test('restart clears throttle, finish state, pressure and telemetry', () => {
  const d = successfulRun(); d.reset(); assert.equal(d.propulsionCut, false); assert.equal(d.throttle, false);
  assert.equal(d.finishCrossed, false); assert.equal(d.finishAt, null); assert.equal(d.firstBrakeAt, null);
  assert.equal(d.gear, 1); assert.equal(d.rpm, 0); assert.equal(d.shiftRemaining, 0); assert.deepEqual(d.gearChanges, []);
  assert.deepEqual(d.history, []); assert.equal(d.result, null); d.launch(100); d.step(1); near(d.speed, 0);
});
