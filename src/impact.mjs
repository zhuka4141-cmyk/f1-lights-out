export const COLLISION_REPLAY_MS = 2600;

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
