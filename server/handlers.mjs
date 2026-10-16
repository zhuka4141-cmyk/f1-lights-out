import { randomBytes } from 'node:crypto';
import { BOARD_VERSION, COOKIE_NAME, PublicError, entryFor, issueRun, normalizeName, playerCookie, replayRace, sign, verifyRun } from './protocol.mjs';

function json(res, status, data) { return res.status(status).json(data); }
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (origin && origin !== `https://${req.headers.host}` && origin !== `http://${req.headers.host}`) {
    throw new PublicError('请从游戏页面提交成绩。', 403);
  }
}
function bodyOf(req) {
  if (Number(req.headers['content-length']) > 160000) throw new PublicError('操作记录过大，请重新挑战。', 413);
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new PublicError('请求格式无效。', 415);
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!body || typeof body !== 'object' || JSON.stringify(body).length > 160000) throw new Error();
    return body;
  } catch { throw new PublicError('比赛记录格式无效。'); }
}
export function createHandlers({ store, secret, now = Date.now }) {
  const wrap = action => async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    try { return await action(req, res); }
    catch (error) {
      if (!(error instanceof PublicError)) console.error('Leaderboard service:', error.name);
      return json(res, error.status || 503, { error: error instanceof PublicError ? error.message : '在线排行榜暂时无法连接，请稍后重试。' });
    }
  };
  return {
    runs: wrap(async (req, res) => {
      if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); throw new PublicError('请求方法无效。', 405); }
      checkOrigin(req); const key = secret();
      if (!key) throw new Error('StorageNotConfigured');
      const playerId = playerCookie(req, key) || randomBytes(16).toString('hex');
      const secure = req.headers.host?.startsWith('localhost:') || req.headers.host?.startsWith('127.0.0.1:') ? '' : '; Secure';
      res.setHeader('Set-Cookie', `${COOKIE_NAME}=${sign(playerId, key)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`);
      const { token } = issueRun(playerId, key, now());
      return json(res, 201, { token, playerId, version: BOARD_VERSION });
    }),
    leaderboard: wrap(async (req, res) => {
      if (req.method === 'GET') {
        const entries = await store.entries();
        res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=10');
        return json(res, 200, { entries, version: BOARD_VERSION, updatedAt: now() });
      }
      if (req.method !== 'POST') { res.setHeader('Allow', 'GET, POST'); throw new PublicError('请求方法无效。', 405); }
      checkOrigin(req);
      const body = bodyOf(req), key = secret(); if (!key) throw new Error('StorageNotConfigured');
      const ticket = verifyRun(body.token, playerCookie(req, key), key, now());
      const name = normalizeName(body.name), result = replayRace(body.proof);
      if (now() - ticket.issuedAt + 3000 < result.totalMs) throw new PublicError('比赛计时无效，请重新挑战。');
      const entry = await store.save(entryFor(name, ticket, result));
      const entries = await store.entries({ fresh: true });
      return json(res, 200, { entry, entries, version: BOARD_VERSION });
    }),
  };
}
