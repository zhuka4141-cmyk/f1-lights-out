export const RULES = Object.freeze({
  distance: 1250,
  roadblockGap: 10,
  maxSpeed: 250 / 3.6,
  acceleration: 10,
  coastDeceleration: 1.1,
  brakeBase: 14.352,
  brakeGain: 28.704,
  pressureBaseRate: .1875,
  pressureSpeedRate: .75,
  pressureReleaseRate: 1,
  skidPressure: 1.15,
  skidDeceleration: 10,
});
const EPS = 1e-9;
export class StartSequence {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset() { this.phase = 'idle'; this.lights = 0; this.result = null; }
  start(now) {
    this.reset(); this.phase = 'sequence'; this.startAt = now;
    this.offAt = now + 5700 + this.random() * 2500;
  }
  tick(now) {
    if (['sequence', 'waiting'].includes(this.phase)) {
      this.lights = Math.min(5, Math.max(0, Math.floor((now - this.startAt - 700) / 1000) + 1));
      if (this.lights === 5) this.phase = 'waiting';
      if (now >= this.offAt) { this.lights = 0; this.goAt = now; this.phase = 'go'; }
    } else if (this.phase === 'go' && now - this.goAt > 10000) this.finish('timeout');
    return this.phase;
  }
  accelerate(now) {
    if (['sequence', 'waiting'].includes(this.phase)) return this.finish('false-start');
    if (this.phase === 'go') return this.finish('valid', Math.max(0, Math.round(now - this.goAt)));
    return null;
  }
  cancel() { return ['sequence', 'waiting', 'go'].includes(this.phase) ? this.finish('cancelled') : null; }
  finish(type, ms = null) { this.phase = 'result'; return this.result = { type, ms }; }
}

// Event boundaries are solved within each sample. The car cannot cross the
// roadblock, miss a full-pressure lockup, or gain speed after its first brake.
export class DriveChallenge {
  constructor() { this.reset(); }
  reset() {
    Object.assign(this, { phase: 'idle', speed: 0, distance: 0, elapsed: 0,
      braking: false, propulsionCut: false, brakePressure: 0, skidded: false,
      skidTime: 0, ms: null, result: null, firstBrakeAt: null,
      firstBrakeDistance: null, initialBrakeSpeed: null, peakPressure: 0,
      outcomeSpeed: 0, history: [], nextSampleAt: 0 });
  }
  launch(ms) {
    if (!Number.isInteger(ms) || ms < 0 || ms > 10000) throw new Error('无效起步');
    if (this.phase !== 'idle') return false;
    this.ms = ms; this.phase = 'driving'; return true;
  }
  setBraking(pressed) {
    if (this.phase !== 'driving') return false;
    if (pressed && !this.propulsionCut) {
      this.propulsionCut = true; this.firstBrakeAt = this.elapsed;
      this.firstBrakeDistance = this.distance; this.initialBrakeSpeed = this.speed;
      this.record(true);
    }
    this.braking = !!pressed; return true;
  }
  record(force = false) {
    if (this.firstBrakeAt == null) return;
    const time = this.elapsed - this.firstBrakeAt;
    const sample = { time, speed: this.speed * 3.6, pressure: this.brakePressure * 100 };
    const last = this.history.at(-1);
    if (last && Math.abs(last.time - time) < EPS) Object.assign(last, sample);
    else if (force || time + EPS >= this.nextSampleAt) {
      this.history.push(sample); this.nextSampleAt = time + .05;
    }
  }
  step(seconds) {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    let remaining = seconds;
    // Fixed telemetry spacing; the integration inside a slice is analytical.
    while (remaining > EPS && ['driving', 'skidding'].includes(this.phase)) {
      const slice = Math.min(remaining, .05);
      this.integrate(slice);
      if (['driving', 'skidding'].includes(this.phase)) this.record();
      remaining -= slice;
    }
  }
  integrate(seconds) {
    let remaining = seconds;
    const R = RULES;
    while (remaining > EPS && ['driving', 'skidding'].includes(this.phase)) {
      const gap = Math.max(0, R.distance + R.roadblockGap - this.distance);
      if (gap <= EPS) { this.finish('collision'); break; }
      if (this.phase === 'skidding' || (this.propulsionCut && !this.braking)) {
        const deceleration = this.skidded ? R.skidDeceleration : R.coastDeceleration;
        const stopTime = this.speed / deceleration;
        const collisionTime = gap <= this.speed ** 2 / (2 * deceleration)
          ? 2 * gap / (this.speed + Math.sqrt(Math.max(0, this.speed ** 2 - 2 * deceleration * gap))) : Infinity;
        const dt = Math.min(remaining, stopTime, collisionTime);
        this.distance += this.speed * dt - .5 * deceleration * dt ** 2;
        this.speed = Math.max(0, this.speed - deceleration * dt);
        this.brakePressure = Math.max(0, this.brakePressure - R.pressureReleaseRate * dt);
        this.elapsed += dt; remaining -= dt;
        if (this.skidded) this.skidTime += dt;
        if (dt >= collisionTime - EPS) this.finish('collision');
        else if (this.speed < EPS) this.finish(this.skidded ? 'skid' : 'valid');
      } else if (this.braking) {
        const coefficient = R.pressureSpeedRate / R.maxSpeed;
        const omega = Math.sqrt(coefficient * R.brakeGain);
        const shiftedPressure = this.brakePressure + R.brakeBase / R.brakeGain;
        const initialRate = R.pressureBaseRate + coefficient * this.speed;
        const evaluate = t => {
          const pressure = shiftedPressure * Math.cos(omega * t)
            + initialRate / omega * Math.sin(omega * t) - R.brakeBase / R.brakeGain;
          return { pressure,
            speed: (-shiftedPressure * omega * Math.sin(omega * t) + initialRate * Math.cos(omega * t) - R.pressureBaseRate) / coefficient,
            distance: (pressure - this.brakePressure - R.pressureBaseRate * t) / coefficient };
        };
        const solve = (upper, predicate) => {
          let low = 0, high = upper;
          for (let i = 0; i < 48; i++) { const mid = (low + high) / 2; if (predicate(evaluate(mid))) high = mid; else low = mid; }
          return high;
        };
        const stopTime = solve(this.speed / (R.brakeBase + R.brakeGain * this.brakePressure), value => value.speed <= 0);
        const lockTime = evaluate(stopTime).pressure >= R.skidPressure
          ? solve(stopTime, value => value.pressure >= R.skidPressure) : Infinity;
        let dt = Math.min(remaining, stopTime, lockTime);
        const collision = evaluate(dt).distance >= gap - EPS;
        if (collision) dt = solve(dt, value => value.distance >= gap);
        const value = evaluate(dt);
        this.distance += value.distance; this.speed = Math.max(0, value.speed);
        this.brakePressure = Math.min(R.skidPressure, value.pressure);
        this.peakPressure = Math.max(this.peakPressure, this.brakePressure);
        this.elapsed += dt; remaining -= dt;
        if (collision) this.finish('collision');
        else if (this.speed < EPS) this.finish('valid');
        else if (dt >= lockTime - EPS) {
          this.brakePressure = R.skidPressure; this.skidded = true;
          this.phase = 'skidding'; this.braking = false; this.record(true);
        }
      } else {
        const toMax = Math.max(0, (R.maxSpeed - this.speed) / R.acceleration);
        const acceleratingDistance = (R.maxSpeed ** 2 - this.speed ** 2) / (2 * R.acceleration);
        const collisionTime = gap <= acceleratingDistance
          ? (Math.sqrt(this.speed ** 2 + 2 * R.acceleration * gap) - this.speed) / R.acceleration
          : toMax + (gap - acceleratingDistance) / R.maxSpeed;
        const dt = Math.min(remaining, collisionTime), acceleratingTime = Math.min(dt, toMax);
        this.distance += this.speed * acceleratingTime + .5 * R.acceleration * acceleratingTime ** 2
          + R.maxSpeed * (dt - acceleratingTime);
        this.speed = Math.min(R.maxSpeed, this.speed + R.acceleration * dt);
        this.elapsed += dt; remaining -= dt;
        if (dt >= collisionTime - EPS) this.finish('collision');
      }
    }
  }
  finish(type) {
    if (type === 'valid' && this.distance > RULES.distance + EPS) type = 'overshoot';
    this.outcomeSpeed = this.speed * 3.6;
    if (type === 'collision') this.distance = RULES.distance + RULES.roadblockGap;
    // A collision's final sample keeps its real impact speed instead of
    // drawing a fictitious controlled stop to zero on the telemetry chart.
    if (type === 'collision') this.record(true);
    this.speed = 0; this.phase = 'stopped'; this.braking = false;
    if (type !== 'collision') this.record(true);
    const offsetCm = Math.round((this.distance - RULES.distance) * 100);
    this.result = { type, ms: this.ms, totalMs: this.ms + Math.round(this.elapsed * 1000),
      offsetCm, distanceCm: Math.abs(offsetCm), stats: this.getStats() };
    return this.result;
  }
  getStats() {
    return { initialSpeed: this.initialBrakeSpeed == null ? null : this.initialBrakeSpeed * 3.6,
      brakeTime: this.firstBrakeAt == null ? null : this.elapsed - this.firstBrakeAt,
      brakeDistance: this.firstBrakeDistance == null ? null : this.distance - this.firstBrakeDistance,
      peakPressure: this.firstBrakeAt == null ? null : this.peakPressure * 100,
      outcomeSpeed: this.outcomeSpeed, history: this.history.map(sample => ({ ...sample })) };
  }
  cancel() {
    if (!['driving', 'skidding'].includes(this.phase)) return null;
    this.phase = 'cancelled'; this.braking = false;
    return this.result = { type: 'cancelled', ms: this.ms, stats: this.getStats() };
  }
}

export const STORAGE_KEY = 'lights-out-250-finish-line-leaderboard-v8';
export const overallScore = entry => entry.totalMs == null ? null
  : 50 / (1 + entry.distanceCm / 500) + 30 / (1 + entry.totalMs / 20000) + 20 / (1 + entry.ms / 300);
const compare = (a, b) => (overallScore(b) ?? -1) - (overallScore(a) ?? -1)
  || a.distanceCm - b.distanceCm || a.totalMs - b.totalMs || a.ms - b.ms || a.at - b.at;

// Each metric chooses a driver's own best round before assigning ranks.
// Equal values share a rank; a faster reaction cannot change a distance rank.
export function rankLeaderboard(entries, metric) {
  if (!['distanceCm', 'ms', 'totalMs', 'score'].includes(metric)) throw new Error('未知排名指标');
  const value = entry => metric === 'score' ? Math.round(overallScore(entry) * 100) / 100 : entry[metric];
  const direction = metric === 'score' ? -1 : 1;
  const ordered = [...entries].sort((a, b) => direction * (value(a) - value(b)) || a.at - b.at || a.id.localeCompare(b.id));
  const drivers = new Set(), best = ordered.filter(entry => {
    const name = entry.name.trim().normalize('NFKC').toLowerCase();
    if (drivers.has(name)) return false;
    drivers.add(name); return true;
  });
  let rank = 0;
  return best.map((entry, index) => {
    if (index === 0 || value(entry) !== value(best[index - 1])) rank = index + 1;
    return { ...entry, rank, ...(metric === 'score' ? { score: value(entry) } : {}) };
  });
}

const validName = name => typeof name === 'string' && name.trim().length > 0
  && [...name.trim()].length <= 20 && !/[\u0000-\u001f\u007f]/.test(name);
const validResult = result => Number.isInteger(result?.ms) && result.ms >= 0 && result.ms <= 10000
  && Number.isSafeInteger(result.totalMs) && result.totalMs >= result.ms
  && Number.isInteger(result.offsetCm) && result.offsetCm >= -RULES.distance * 100 && result.offsetCm <= 0
  && result.distanceCm === Math.abs(result.offsetCm);
export class LocalLeaderboard {
  constructor(storage) {
    this.storage = storage; this.entries = [];
    try {
      const data = JSON.parse(storage.getItem(STORAGE_KEY) || '[]');
      if (Array.isArray(data)) this.entries = data.filter(entry => validResult(entry)
        && typeof entry.id === 'string' && validName(entry.name) && Number.isFinite(entry.at)).sort(compare);
    } catch { /* Private browsing and invalid saved data leave an empty local board. */ }
    this.offer(null);
  }
  offer(result) { this.result = result?.type === 'valid' && validResult(result) ? result : null; this.consented = false; this.saved = false; }
  agree() { this.consented = true; }
  save(name, at = Date.now()) {
    if (this.saved) throw new Error('本轮已经记录。');
    if (!this.result) throw new Error('只有有效刹停才能上榜。');
    if (!this.consented) throw new Error('请先同意记录成绩。');
    if (!validName(name)) throw new Error('请输入名字，最多 20 个字。');
    const { ms, totalMs, offsetCm, distanceCm } = this.result;
    const entry = { id: `${at}-${Math.random().toString(36).slice(2, 10)}`, name: name.trim(), ms, totalMs, offsetCm, distanceCm, at };
    const entries = [...this.entries, entry].sort(compare);
    this.storage.setItem(STORAGE_KEY, JSON.stringify(entries));
    this.entries = entries; this.saved = true; return entry;
  }
}
