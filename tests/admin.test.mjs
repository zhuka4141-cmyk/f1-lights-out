import test from 'node:test';
import assert from 'node:assert/strict';
import { createBlobStore, storeForVersion } from '../server/store.mjs';
import { createAdminHandlers } from '../server/admin-handlers.mjs';
import { hashPassword, verifyPassword, issueAdminSession, authenticated } from '../server/admin-auth.mjs';
import { editableValues, validateValues } from '../server/moderation.mjs';
import { overallScore, rankLeaderboard } from '../src/core.mjs';

const secret = 'admin-tests-only-secret', password = 'test-password-4815', hash = hashPassword(password);
const first = { id: '1'.repeat(32), playerId: 'a'.repeat(32), name: '朱', ms: 213, finishMs: 22307,
  totalMs: 32042, offsetCm: -68, distanceCm: 68, at: 1800000000000 };
const second = { ...first, id: '2'.repeat(32), distanceCm: 100, offsetCm: -100, at: first.at + 1000 };
function blobMemory() {
  const records = new Map(); let version = 0;
  return {
    async get(path) {
      const value = records.get(path); if (!value) return null;
      return { statusCode: 200, blob: { etag: `W/${value.etag}` }, stream: new Response(value.body).body };
    },
    async put(path, body, options) {
      const previous = records.get(path);
      if (options.ifMatch && options.ifMatch !== previous?.etag) throw Object.assign(new Error('Conflict'), { name: 'BlobPreconditionFailedError' });
      if (previous && !options.allowOverwrite) throw new Error('Blob already exists');
      records.set(path, { body, etag: String(++version) }); return {};
    },
    async list({ prefix }) { return { blobs: [...records.keys()].filter(path => path.startsWith(prefix)).map(pathname => ({ pathname })), hasMore: false }; },
  };
}
function response() { return { headers: {}, setHeader(key, value) { this.headers[key] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
const request = (method, cookie, body) => ({ method, headers: { host: 'game.test', origin: 'https://game.test', cookie, 'content-type': 'application/json' }, body });
function service(store = createBlobStore('test', blobMemory()), current = () => first.at) {
  return { store, handlers: createAdminHandlers({ store, secret: () => secret, passwordHash: () => hash, now: current }) };
}
const cookie = () => `ddg_admin=${issueAdminSession(secret, hash, first.at)}`;

test('passwords use salted scrypt and reject wrong credentials; sessions expire and bind to the password', () => {
  assert.equal(verifyPassword(password, hash), true); assert.equal(verifyPassword('incorrect', hash), false);
  assert.notEqual(hashPassword(password), hash); assert.equal(verifyPassword(password, ''), false);
  const req = request('GET', cookie());
  assert.equal(authenticated(req, secret, hash, first.at), true);
  assert.equal(authenticated(req, secret, hash, first.at + 8 * 3600000), false);
  assert.equal(authenticated(req, secret, hashPassword('new-password'), first.at), false);
  assert.equal(authenticated(request('GET', `${cookie()}x`), secret, hash, first.at), false);
});
test('score management requires server authentication for every read and write', async () => {
  const { handlers } = service();
  for (const method of ['GET', 'PATCH']) {
    const res = response(); await handlers.scores(request(method, '', { id: first.id, action: 'delete', revision: 0 }), res);
    assert.equal(res.statusCode, 401); assert.doesNotMatch(JSON.stringify(res.body), /playerId|22307/);
  }
});
test('login sets a secure HttpOnly cookie, wrong passwords fail, logout clears it', async () => {
  const { handlers } = service(); const bad = response();
  await handlers.session(request('POST', '', { password: 'wrong' }), bad); assert.equal(bad.statusCode, 401);
  const good = response(); await handlers.session(request('POST', '', { password }), good);
  assert.equal(good.statusCode, 200); assert.match(good.headers['Set-Cookie'], /HttpOnly; SameSite=Strict/); assert.match(good.headers['Set-Cookie'], /Secure/);
  assert.doesNotMatch(JSON.stringify(good.body), /scrypt|password|secret/);
  const out = response(); await handlers.session(request('DELETE', good.headers['Set-Cookie']), out);
  assert.equal(out.statusCode, 200); assert.match(out.headers['Set-Cookie'], /Max-Age=0/);
});
test('persistent login rate limiting holds across independent backend instances and resets after a minute', async () => {
  const client = blobMemory(), a = createBlobStore('test', client), b = createBlobStore('test', client), fingerprint = 'f'.repeat(64);
  for (let i = 0; i < 8; i++) await (i % 2 ? a : b).consumeLoginAttempt(fingerprint, first.at);
  await assert.rejects(a.consumeLoginAttempt(fingerprint, first.at + 59999), error => error.status === 429);
  await b.consumeLoginAttempt(fingerprint, first.at + 60000);
});
test('admin lists all rounds, including non-winning results, while public ranks use each player best', async () => {
  const { store, handlers } = service(); await store.save(first); await store.save(second);
  assert.equal((await store.entries()).length, 1);
  const res = response(); await handlers.scores(request('GET', cookie()), res);
  assert.equal(res.statusCode, 200); assert.equal(res.body.entries.length, 2);
});
test('edits persist across instances, recalculate overall score and keep immutable originals', async () => {
  const client = blobMemory(), a = createBlobStore('test', client), b = createBlobStore('test', client); await a.save(first);
  const values = { ...editableValues(first), name: '修改昵称', distanceCm: 25, ms: 180 };
  const edited = await a.moderate({ id: first.id, action: 'edit', revision: 0, values }, first.at + 3000);
  assert.equal(edited.revision, 1); assert.equal(edited.offsetCm, -25); assert.equal(edited.name, '修改昵称');
  assert.equal(edited.score, Math.round(overallScore(edited) * 100) / 100);
  const visible = await b.entries(); assert.equal(visible[0].name, '修改昵称'); assert.equal(visible[0].distanceCm, 25);
  const retry = await b.save(first); assert.equal(retry.name, '修改昵称');
  assert.equal((await b.allEntries()).audit[0].before.name, first.name);
});
test('deletion hides only the chosen round, promotes another round and restoration reinstates it', async () => {
  const client = blobMemory(), store = createBlobStore('test', client); await store.save(first); await store.save(second);
  const before = rankLeaderboard(await store.entries(), 'distanceCm'); assert.equal(before[0].id, first.id);
  await store.moderate({ id: first.id, action: 'delete', revision: 0 }, first.at + 1000);
  assert.equal((await store.entries())[0].id, second.id);
  const restarted = createBlobStore('test', client); assert.equal((await restarted.entries())[0].id, second.id);
  await assert.rejects(restarted.save(first), error => error.status === 409);
  assert.equal((await restarted.allEntries()).entries.find(entry => entry.id === first.id).deleted, true);
  await restarted.moderate({ id: first.id, action: 'restore', revision: 1 }, first.at + 2000);
  assert.equal((await restarted.entries())[0].id, first.id);
});
test('concurrent changes to different records survive compare-and-swap retries', async () => {
  const client = blobMemory(), a = createBlobStore('test', client), b = createBlobStore('test', client); await a.save(first); await a.save(second);
  await Promise.all([a.moderate({ id: first.id, action: 'delete', revision: 0 }), b.moderate({ id: second.id, action: 'delete', revision: 0 })]);
  const all = await createBlobStore('test', client).allEntries(); assert.equal(all.entries.filter(entry => entry.deleted).length, 2); assert.equal(all.audit.length, 2);
});
test('stale or concurrent edits to the same round return a conflict instead of overwriting changes', async () => {
  const client = blobMemory(), a = createBlobStore('test', client), b = createBlobStore('test', client); await a.save(first);
  const results = await Promise.allSettled([a.moderate({ id: first.id, action: 'edit', revision: 0, values: editableValues(first) }), b.moderate({ id: first.id, action: 'delete', revision: 0 })]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.find(result => result.status === 'rejected').reason.status, 409);
});
test('admin rejects invalid metrics, forged player identities, missing records and cross-site writes', async () => {
  for (const values of [{ ...editableValues(first), distanceCm: -1 }, { ...editableValues(first), finishMs: 1000 },
    { ...editableValues(first), totalMs: 1 }, { ...editableValues(first), playerId: 'forged' }, { ...editableValues(first), name: '\u202eevil' }]) assert.throws(() => validateValues(values));
  const { store, handlers } = service(); await store.save(first);
  const crossSite = request('PATCH', cookie(), { id: first.id, action: 'delete', revision: 0 }); crossSite.headers.origin = 'https://other.test';
  const res = response(); await handlers.scores(crossSite, res); assert.equal(res.statusCode, 403);
  await assert.rejects(store.moderate({ id: '9'.repeat(32), action: 'delete', revision: 0 }), error => error.status === 404);
  assert.equal((await store.entries()).length, 1);
});

test('historical 500 m results remain manageable without entering the current 250 m leaderboard', async () => {
  const client = blobMemory(), legacy = createBlobStore('geared-v10', client), current = createBlobStore('sprint250-v11', client);
  const far = { ...first, distanceCm: 35000, offsetCm: -35000 };
  await legacy.save(far); await current.save(second);
  assert.equal((await legacy.allEntries()).entries[0].distanceCm, 35000);
  const edited = await legacy.moderate({ id: first.id, revision: 0, action: 'edit', values: { ...editableValues(far), name: '历史车手' } });
  assert.ok(edited.score > 0); assert.equal(edited.score, Math.round(overallScore(edited, 500) * 100) / 100);
  assert.equal((await createBlobStore('geared-v10', client).entries())[0].name, '历史车手');
  assert.deepEqual((await current.allEntries()).entries.map(entry => entry.id), [second.id]);
  assert.throws(() => validateValues(editableValues(far)), /250/);
  assert.throws(() => storeForVersion('../geared-v10'), /赛制/);
});

test('admin rule selection routes edits and reads to the same isolated board', async () => {
  const client = blobMemory(), current = createBlobStore('sprint250-v11', client), legacy = createBlobStore('geared-v10', client);
  await current.save(first); await legacy.save(second);
  const handlers = createAdminHandlers({ store: current, resolveStore: version => {
    if (version === 'sprint250-v11') return current;
    if (version === 'geared-v10') return legacy;
    return storeForVersion(version);
  }, secret: () => secret, passwordHash: () => hash, now: () => first.at });
  const read = request('GET', cookie()); read.url = '/api/admin-scores?version=geared-v10';
  const result = response(); await handlers.scores(read, result);
  assert.equal(result.body.roadblockGap, 500); assert.equal(result.body.entries[0].id, second.id);
  const deleted = response(); await handlers.scores(request('PATCH', cookie(), { version: 'geared-v10', id: second.id, action: 'delete', revision: 0 }), deleted);
  assert.equal(deleted.statusCode, 200); assert.equal((await legacy.entries()).length, 0);
  assert.equal((await current.entries())[0].id, first.id);
});
