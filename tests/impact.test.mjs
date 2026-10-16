import test from 'node:test';
import assert from 'node:assert/strict';
import { createDebrisMotion, sampleDebris, sampleEngineCoast } from '../src/impact.mjs';
import { DriveChallenge, RULES, isScoringResult } from '../src/core.mjs';

const origin = { x:-2, y:1.4, z:-1250, floor:.5 };

test('a blown engine keeps its momentum, slows continuously and eventually stops', () => {
  const start = sampleEngineCoast(250, 0);
  assert.equal(start.distance, 0); assert.equal(start.speed, 250 / 3.6);
  let previous = start;
  for (let t = .05; t < 20; t += .05) {
    const sample = sampleEngineCoast(250, t);
    assert.ok(sample.distance >= previous.distance && sample.speed <= previous.speed);
    assert.ok(sample.speed >= 0); previous = sample;
  }
  assert.equal(previous.speed, 0); assert.equal(previous.stopped, true);
  assert.ok(sampleEngineCoast(250, 2.6).distance > 100);
  assert.ok(sampleEngineCoast(100, 2.6).distance < sampleEngineCoast(250, 2.6).distance);
  assert.deepEqual(sampleEngineCoast(250, 120), previous);
  assert.deepEqual(sampleEngineCoast(250, -.1), start);
  assert.equal(sampleEngineCoast(0, 1).distance, 0);
});

test('engine aftermath is deterministic, stays before the barrier and cannot change the failed score', () => {
  const d = new DriveChallenge(); d.launch(200); d.setThrottle(true); d.step(20);
  assert.equal(d.result.type, 'engine-blown');
  const snapshot = structuredClone(d);
  const sample = sampleEngineCoast(d.outcomeSpeed, 1.5, 40);
  assert.deepEqual(sample, { ...sample, distance:40, speed:0, stopped:true });
  sampleEngineCoast(d.outcomeSpeed, 20, RULES.distance + RULES.roadblockGap - d.distance);
  assert.deepEqual(sampleEngineCoast(d.outcomeSpeed, 1.5, 40), sample);
  assert.deepEqual(structuredClone(d), snapshot); assert.equal(isScoringResult(d.result), false);
  assert.equal(d.speed, 0); assert.equal(d.finishAt, null);
});

test('an impact pushes authored parts outwards and forward with speed-dependent force', () => {
  const fast = createDebrisMotion(origin, 0, 250, () => .6);
  const slow = createDebrisMotion(origin, 0, 25, () => .6);
  assert.ok(fast.vx < 0 && fast.vz < 0 && fast.vy > 0);
  assert.ok(fast.vy > slow.vy && Math.abs(fast.vz) > Math.abs(slow.vz));
  const right = createDebrisMotion({ ...origin, x:2 }, 0, 250, () => .6);
  assert.ok(right.vx > 0);
  assert.notDeepEqual(fast, createDebrisMotion(origin, 0, 250, () => .2));
});

test('ballistic fragments bounce and settle above the road, including across skipped frames', () => {
  const motion = createDebrisMotion(origin, 0, 250, () => .6);
  const before = structuredClone(motion);
  for (let t = 0; t <= 12; t += .017) {
    const sample = sampleDebris(motion, t);
    assert.ok(sample.y >= origin.floor);
    assert.ok([sample.x, sample.y, sample.z, ...sample.rotation].every(Number.isFinite));
  }
  const landing = (motion.vy + Math.sqrt(motion.vy ** 2 + 2 * 9.81 * (origin.y - origin.floor))) / 9.81;
  assert.ok(sampleDebris(motion, landing + .05).y > origin.floor);
  assert.equal(sampleDebris(motion, 12).y, origin.floor);
  const expected = sampleDebris(motion, 2.6);
  sampleDebris(motion, 10); sampleDebris(motion, .2);
  assert.deepEqual(sampleDebris(motion, 2.6), expected);
  assert.deepEqual(motion, before);
});
