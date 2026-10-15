import test from 'node:test';
import assert from 'node:assert/strict';
import { createDebrisMotion, sampleDebris } from '../src/impact.mjs';

const origin = { x:-2, y:1.4, z:-1250, floor:.5 };

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
