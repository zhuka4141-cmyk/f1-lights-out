import test from 'node:test';
import assert from 'node:assert/strict';
import { DriveChallenge, rankLeaderboard } from '../src/core.mjs';
import { createHandlers } from '../server/handlers.mjs';
import { issueRun, replayRace, sign, verifyRun } from '../server/protocol.mjs';

function finishedRace() {
  const drive = new DriveChallenge(); drive.launch(213); drive.setThrottle(true); drive.step(6.8); drive.setThrottle(false);
  while (!drive.finishCrossed && !drive.result) {
    if (drive.speed * 3.6 < 240) drive.setThrottle(true);
    if (drive.speed * 3.6 > 248) drive.setThrottle(false);
    drive.step(.01);
  }
  drive.step(2.6); drive.setBraking(true); drive.step(1); drive.setBraking(false); drive.step(.5); drive.setBraking(true); drive.step(20);
  assert.equal(drive.result.type, 'valid');
  return { ms: drive.ms, duration: drive.elapsed, inputs: drive.inputs, distanceCm: drive.result.distanceCm, finishMs: drive.result.finishMs };
}
const proof = finishedRace(), secret = 'test-only-secret', issuedAt = 1800000000000;
function response() { return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function service() {
  const entries = new Map();
  const store = { async save(entry) { if (!entries.has(entry.id)) entries.set(entry.id, entry); return entries.get(entry.id); }, async entries() { return [...entries.values()]; } };
  return createHandlers({ store, secret: () => secret, now: () => issuedAt + 120000 });
}
const request = (method, cookie, body) => ({ method, headers: { host: 'game.test', origin: 'https://game.test', 'content-type': 'application/json', cookie }, body });

test('server replays recorded inputs and independently derives the exact finish and stop', () => {
  const result = replayRace(proof); assert.equal(result.type, 'valid');
  assert.equal(result.distanceCm, proof.distanceCm); assert.equal(result.finishMs, proof.finishMs);
  assert.throws(() => replayRace({ ...proof, distanceCm: 0 }), /不一致/);
  assert.throws(() => replayRace({ ...proof, finishMs: 1 }), /不一致/);
  assert.throws(() => replayRace({ ...proof, inputs: [[0, true, false]] }), /正常刹停/);
});
test('invalid, oversized and non-monotonic race recordings are rejected', () => {
  for (const invalid of [null, { ...proof, duration: 601 }, { ...proof, inputs: Array(4097).fill([0, true, false]) },
    { ...proof, inputs: [[1, true, false], [0, false, false]] }, { ...proof, inputs: [[0, 'true', false]] }]) {
    assert.throws(() => replayRace(invalid));
  }
});
test('signed race tickets bind to one player and expire; editing the ticket is rejected', () => {
  const player = '1'.repeat(32), { token } = issueRun(player, secret, issuedAt);
  assert.equal(verifyRun(token, player, secret, issuedAt + 120000).playerId, player);
  assert.throws(() => verifyRun(`${token}x`, player, secret, issuedAt));
  assert.throws(() => verifyRun(token, '2'.repeat(32), secret, issuedAt));
  assert.throws(() => verifyRun(token, player, secret, issuedAt + 7200001));
});
test('independent devices share persisted scores and identical nicknames remain separate drivers', async () => {
  const handlers = service();
  for (const char of ['1', '2']) {
    const player = char.repeat(32), { token } = issueRun(player, secret, issuedAt);
    const res = response(); await handlers.leaderboard(request('POST', `ddg_player=${sign(player, secret)}`, { name: '朱', token, proof }), res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.entry.playerId, player);
  }
  const res = response(); await handlers.leaderboard(request('GET'), res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.entries.length, 2);
  for (const metric of ['distanceCm', 'ms', 'finishMs', 'score']) {
    const ranked = rankLeaderboard(res.body.entries, metric);
    assert.equal(ranked.length, 2); assert.deepEqual(ranked.map(item => item.rank), [1, 1]);
  }
});
test('retrying a saved race creates one result and cannot rename or overwrite that race', async () => {
  const handlers = service(), player = '3'.repeat(32), { token } = issueRun(player, secret, issuedAt);
  const submit = async name => {
    const res = response(); await handlers.leaderboard(request('POST', `ddg_player=${sign(player, secret)}`, { name, token, proof }), res); return res;
  };
  const results = await Promise.all([submit('第一次'), submit('重试')]);
  assert.equal(results[0].body.entry.id, results[1].body.entry.id);
  assert.equal(results[1].body.entry.name, '第一次'); assert.equal(results[1].body.entries.length, 1);
});
test('API rejects cross-site writes, missing player cookies, impossible clocks and invalid names', async () => {
  const handlers = service(), player = '4'.repeat(32), { token } = issueRun(player, secret, issuedAt);
  const cookie = `ddg_player=${sign(player, secret)}`, body = { name: '玩家', token, proof };
  const foreign = request('POST', cookie, body); foreign.headers.origin = 'https://other.test';
  for (const req of [foreign, request('POST', '', body), request('POST', cookie, { ...body, name: 'x'.repeat(21) })]) {
    const res = response(); await handlers.leaderboard(req, res); assert.ok(res.statusCode >= 400);
  }
  const fast = createHandlers({ store: {}, secret: () => secret, now: () => issuedAt });
  const res = response(); await fast.leaderboard(request('POST', cookie, body), res);
  assert.equal(res.statusCode, 400); assert.match(res.body.error, /计时/);
});
test('run endpoint issues a secure private cookie and supports repeat visits without losing player identity', async () => {
  const handlers = service(), first = response(); await handlers.runs(request('POST'), first);
  assert.equal(first.statusCode, 201); assert.match(first.headers['Set-Cookie'], /HttpOnly; SameSite=Lax/); assert.match(first.headers['Set-Cookie'], /Secure/);
  const second = response(); await handlers.runs(request('POST', first.headers['Set-Cookie'].split(';')[0]), second);
  assert.equal(first.body.playerId, second.body.playerId); assert.notEqual(first.body.token, second.body.token);
});
test('server failures give a retryable error without exposing storage credentials', async () => {
  const handlers = createHandlers({ store: { entries() { throw new Error('private token: do-not-publish'); } }, secret: () => secret });
  const res = response(); await handlers.leaderboard(request('GET'), res);
  assert.equal(res.statusCode, 503); assert.doesNotMatch(JSON.stringify(res.body), /do-not-publish/);
});
