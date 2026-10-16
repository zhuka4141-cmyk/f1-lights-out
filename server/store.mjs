import { get, list, put } from '@vercel/blob';
import { isScoringResult, rankLeaderboard } from '../src/core.mjs';
import { BOARD_VERSION } from './protocol.mjs';

const options = { access: 'private', addRandomSuffix: false, allowOverwrite: false, contentType: 'application/json' };
async function readRecord(path) {
  const blob = await get(path, { access: 'private' });
  if (!blob || blob.statusCode !== 200) return null;
  return JSON.parse(await new Response(blob.stream).text());
}
function decodeIndex(pathname, prefix) {
  try {
    const encoded = pathname.slice(`${prefix}index/`.length).replace(/\.json$/, '');
    const entry = JSON.parse(Buffer.from(encoded, 'base64url').toString());
    return isScoringResult({ ...entry, type: 'valid' }) && /^[a-f0-9]{32}$/.test(entry.id)
      && /^[a-f0-9]{32}$/.test(entry.playerId) && typeof entry.name === 'string'
      && [...entry.name].length <= 20 && Number.isSafeInteger(entry.at) ? entry : null;
  } catch { return null; }
}
export function createBlobStore(namespace = BOARD_VERSION) {
const prefix = `leaderboards/${namespace}/`;
let cached = null, loading = null;
return {
  async save(entry) {
    // One immutable claim per signed race makes retries and simultaneous submits idempotent.
    const claim = `${prefix}runs/${entry.id}.json`;
    let saved = entry;
    try { await put(claim, JSON.stringify(entry), options); }
    catch (error) { saved = await readRecord(claim); if (!saved) throw error; }
    // The private index embeds the public summary, so a board refresh needs paged list
    // requests rather than downloading every player's individual score file.
    const path = `${prefix}index/${Buffer.from(JSON.stringify(saved)).toString('base64url')}.json`;
    try { await put(path, JSON.stringify(saved), options); }
    catch (error) { if (!(await readRecord(path))) throw error; }
    cached = null;
    return saved;
  },
  async entries({ fresh = false } = {}) {
    if (!fresh && cached && Date.now() - cached.at < 8000) return cached.entries;
    if (loading) { const current = await loading; if (!fresh) return current; }
    loading = (async () => {
      const unique = new Map(); let cursor;
      do {
        const page = await list({ prefix: `${prefix}index/`, limit: 1000, ...(cursor ? { cursor } : {}) });
        for (const blob of page.blobs) { const entry = decodeIndex(blob.pathname, prefix); if (entry) unique.set(entry.id, entry); }
        cursor = page.hasMore ? page.cursor : undefined;
      } while (cursor);
      const entries = [...unique.values()], best = new Map();
      for (const metric of ['distanceCm', 'ms', 'finishMs', 'score']) {
        for (const entry of rankLeaderboard(entries, metric)) best.set(entry.id, entry);
      }
      const result = [...best.values()]; cached = { at: Date.now(), entries: result }; return result;
    })();
    try { return await loading; } finally { loading = null; }
  },
};
}
export const blobStore = createBlobStore();
