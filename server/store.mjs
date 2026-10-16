import { get, list, put, BlobNotFoundError, BlobPreconditionFailedError } from '@vercel/blob';
import { RULES, isScoringResult, rankLeaderboard } from '../src/core.mjs';
import { BOARD_VERSION, PublicError } from './protocol.mjs';
import { applyModeration, changeModeration } from './moderation.mjs';

const options = { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' };
function decodeIndex(pathname, prefix, roadblockGap) {
  try {
    const encoded = pathname.slice(`${prefix}index/`.length).replace(/\.json$/, '');
    const entry = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    return isScoringResult({ ...entry, type: 'valid' }, roadblockGap) && /^[a-f0-9]{32}$/.test(entry.id)
      && /^[a-f0-9]{32}$/.test(entry.playerId) && typeof entry.name === 'string'
      && [...entry.name].length <= 20 && Number.isSafeInteger(entry.at) ? entry : null;
  } catch { return null; }
}
export function createBlobStore(namespace = BOARD_VERSION, client = { get, list, put }) {
  const roadblockGap = RULES.roadblockGap;
  const prefix = `leaderboards/${namespace}/`, moderationPath = `${prefix}moderation.json`;
  let cached = null, loading = null, generation = 0;
  const invalidate = () => { cached = null; generation++; };
  async function readState(path) {
    let blob;
    try { blob = await client.get(path, { access: 'private', useCache: false }); }
    catch (error) { if (error instanceof BlobNotFoundError || error.name === 'BlobNotFoundError') return null; throw error; }
    if (!blob || blob.statusCode !== 200) return null;
    return { data: JSON.parse(await new Response(blob.stream).text()), etag: blob.blob.etag.replace(/^W\//, '') };
  }
  async function updateState(path, transform) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const previous = await readState(path), next = transform(previous?.data || {});
      try {
        await client.put(path, JSON.stringify(next), { ...options,
          ...(previous ? { allowOverwrite: true, ifMatch: previous.etag } : {}) });
        return next;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError || error.name === 'BlobPreconditionFailedError') continue;
        if (!previous && await readState(path)) continue;
        throw error;
      }
    }
    throw new PublicError('其他管理操作正在保存，请刷新后重试。', 409);
  }
  async function originals() {
    const unique = new Map(); let cursor;
    do {
      const page = await client.list({ prefix: `${prefix}index/`, limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const blob of page.blobs) { const entry = decodeIndex(blob.pathname, prefix, roadblockGap); if (entry) unique.set(entry.id, entry); }
      cursor = page.hasMore ? page.cursor : undefined;
    } while (cursor);
    return [...unique.values()];
  }
  const store = {
    roadblockGap,
    async save(entry) {
      const claim = `${prefix}runs/${entry.id}.json`;
      let saved = entry;
      try { await client.put(claim, JSON.stringify(entry), options); }
      catch (error) { saved = (await readState(claim))?.data; if (!saved) throw error; }
      const path = `${prefix}index/${Buffer.from(JSON.stringify(saved)).toString('base64url')}.json`;
      try { await client.put(path, JSON.stringify(saved), options); }
      catch (error) { if (!(await readState(path))) throw error; }
      invalidate();
      // Replayed submissions cannot undo an administrator's edits or deletion.
      const state = (await readState(moderationPath))?.data;
      const moderated = applyModeration([saved], state)[0];
      if (moderated.deleted) throw new PublicError('这条成绩已由管理员移除。', 409);
      const { revision, deleted, edited, updatedAt, ...result } = moderated;
      return result;
    },
    async allEntries() {
      const [entries, snapshot] = await Promise.all([originals(), readState(moderationPath)]);
      const state = snapshot?.data;
      return { entries: applyModeration(entries, state).sort((a, b) => b.at - a.at || a.id.localeCompare(b.id)), audit: state?.audit || [] };
    },
    async moderate(change, now = Date.now()) {
      if (!/^[a-f0-9]{32}$/.test(change?.id || '')) throw new PublicError('成绩编号无效。');
      const original = (await readState(`${prefix}runs/${change.id}.json`))?.data;
      if (!original) throw new PublicError('这条成绩不存在。', 404);
      const state = await updateState(moderationPath, current => changeModeration(current, original, change, now, roadblockGap));
      invalidate();
      return applyModeration([original], state)[0];
    },
    async consumeLoginAttempt(fingerprint, now) {
      if (!/^[a-f0-9]{64}$/.test(fingerprint)) throw new Error('InvalidLoginFingerprint');
      const path = `${prefix}auth/${fingerprint}.json`;
      await updateState(path, current => {
        const reset = !current.start || now - current.start >= 60000;
        const count = reset ? 0 : current.count;
        if (count >= 8) throw new PublicError('尝试次数过多，请一分钟后再试。', 429);
        return { start: reset ? now : current.start, count: count + 1 };
      });
    },
    async entries({ fresh = false } = {}) {
      if (!fresh && cached && Date.now() - cached.at < 5000) return cached.entries;
      if (loading) { const current = await loading; if (!fresh) return current; }
      const currentGeneration = generation;
      loading = (async () => {
        const { entries } = await store.allEntries(), best = new Map();
        for (const metric of ['distanceCm', 'ms', 'finishMs', 'score']) {
          for (const entry of rankLeaderboard(entries.filter(item => !item.deleted), metric, roadblockGap)) {
            const { revision, deleted, edited, updatedAt, ...summary } = entry; best.set(entry.id, summary);
          }
        }
        const result = [...best.values()];
        if (currentGeneration === generation) cached = { at: Date.now(), entries: result };
        return result;
      })();
      try { return await loading; } finally { loading = null; }
    },
  };
  return store;
}
export const blobStore = createBlobStore();
