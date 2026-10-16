export const COLLISION_REPLAY_MS = 2600;

// A failed engine loses power, not momentum. Rolling resistance and aerodynamic
// drag slow the visual aftermath; this never advances the finished race/replay.
export function sampleEngineCoast(speedKmh, seconds, maxDistance = Infinity) {
  const initial = Math.max(0, speedKmh) / 3.6, rolling = 3.6, drag = .0018;
  const scale = Math.sqrt(rolling / drag), rate = Math.sqrt(rolling * drag);
  const angle = Math.atan(initial / scale), stopTime = angle / rate;
  const t = Math.max(0, Math.min(seconds, stopTime));
  const remainingAngle = Math.max(0, angle - rate * t);
  const distance = Math.log(Math.cos(remainingAngle) / Math.cos(angle)) / drag;
  const limit = Math.max(0, maxDistance), atBarrier = distance >= limit;
  return { distance:Math.min(distance, limit), speed:atBarrier || t >= stopTime ? 0 : scale * Math.tan(remainingAngle),
    stopped:atBarrier || t >= stopTime, stopTime };
}

// Visual aftermath only: racing physics and the recorded impact stay unchanged.
export function createDebrisMotion(origin, contactX, speedKmh, random = Math.random) {
  const strength = .28 + .72 * Math.max(0, Math.min(1, speedKmh / 250));
  const offset = origin.x - contactX, influence = Math.exp(-Math.abs(offset) / 6);
  const side = Math.abs(offset) > .4 ? Math.sign(offset) : random() < .5 ? -1 : 1;
  const force = strength * (.45 + .55 * influence);
  return {
    origin: { ...origin },
    vx: side * (2 + random() * 8) * force,
    vy: (4.5 + random() * 8) * force,
    vz: -(4 + random() * 14) * force,
    spin: Array.from({ length: 3 }, () => (random() - .5) * 11 * strength),
  };
}

// Sample an absolute time so long frames cannot change where fragments land.
export function sampleDebris(motion, seconds) {
  const t = Math.max(0, seconds), gravity = 9.81, floor = motion.origin.floor;
  let remaining = t, y = motion.origin.y, velocity = motion.vy, firstLanding = 0;
  for (let bounce = 0; bounce < 9; bounce++) {
    const flight = (velocity + Math.sqrt(velocity ** 2 + 2 * gravity * Math.max(0, y - floor))) / gravity;
    if (bounce === 0) firstLanding = flight;
    if (remaining <= flight) {
      y += velocity * remaining - .5 * gravity * remaining ** 2;
      break;
    }
    remaining -= flight;
    velocity = Math.max(0, gravity * flight - velocity) * .3;
    y = floor;
    if (velocity < .2) break;
  }
  const travel = (1 - Math.exp(-.6 * t)) / .6;
  const turn = Math.min(t, firstLanding) + (t > firstLanding ? (1 - Math.exp(-3 * (t - firstLanding))) / 3 : 0);
  return {
    x: motion.origin.x + motion.vx * travel,
    y: Math.max(floor, y),
    z: motion.origin.z + motion.vz * travel,
    rotation: motion.spin.map(speed => speed * turn),
  };
}
