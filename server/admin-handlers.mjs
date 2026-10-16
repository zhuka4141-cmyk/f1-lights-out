import { BOARD_VERSION, PublicError } from './protocol.mjs';
import { adminCookie, assertAdmin, authenticated, issueAdminSession, loginFingerprint, verifyPassword } from './admin-auth.mjs';

function checkOrigin(req) {
  const origin = req.headers.origin;
  if (req.headers['sec-fetch-site'] === 'cross-site'
    || origin && origin !== `https://${req.headers.host}` && origin !== `http://${req.headers.host}`) {
    throw new PublicError('请从管理后台操作。', 403);
  }
}
function bodyOf(req) {
  if (!(req.headers['content-type'] || '').startsWith('application/json')) throw new PublicError('请求格式无效。', 415);
  if (Number(req.headers['content-length']) > 8192) throw new PublicError('请求过大。', 413);
  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!data || typeof data !== 'object' || Array.isArray(data) || JSON.stringify(data).length > 8192) throw new Error();
    return data;
  } catch { throw new PublicError('请求内容无效。'); }
}
function assertCurrentVersion(version) {
  if (version && version !== BOARD_VERSION) throw new PublicError('该赛制已停用。', 410);
}
export function createAdminHandlers({ store, secret, passwordHash, now = Date.now }) {
  const wrap = action => async (req, res) => {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    try { return await action(req, res); }
    catch (error) {
      if (!(error instanceof PublicError)) console.error('Admin service:', error.name);
      if (error.status === 429) res.setHeader('Retry-After', '60');
      return res.status(error.status || 503).json({ error: error instanceof PublicError ? error.message : '后台服务暂时不可用，请稍后重试。' });
    }
  };
  return {
    session: wrap(async (req, res) => {
      const key = secret(), hash = passwordHash();
      if (req.method === 'GET') return res.status(200).json({ authenticated: authenticated(req, key, hash, now()) });
      if (!['POST', 'DELETE'].includes(req.method)) { res.setHeader('Allow', 'GET, POST, DELETE'); throw new PublicError('请求方法无效。', 405); }
      checkOrigin(req);
      if (req.method === 'DELETE') { res.setHeader('Set-Cookie', adminCookie(req)); return res.status(200).json({ authenticated: false }); }
      if (!key || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{64}$/.test(hash || '')) throw new Error('AdminNotConfigured');
      const body = bodyOf(req);
      await store.consumeLoginAttempt(loginFingerprint(req, key), now());
      if (!verifyPassword(body.password, hash)) throw new PublicError('密码不正确。', 401);
      res.setHeader('Set-Cookie', adminCookie(req, issueAdminSession(key, hash, now())));
      return res.status(200).json({ authenticated: true });
    }),
    scores: wrap(async (req, res) => {
      assertAdmin(req, secret(), passwordHash(), now());
      if (req.method === 'GET') {
        assertCurrentVersion(new URL(req.url || '/', 'http://localhost').searchParams.get('version'));
        return res.status(200).json({ ...await store.allEntries(), version: BOARD_VERSION, roadblockGap: store.roadblockGap });
      }
      if (req.method !== 'PATCH') { res.setHeader('Allow', 'GET, PATCH'); throw new PublicError('请求方法无效。', 405); }
      checkOrigin(req); const change = bodyOf(req);
      assertCurrentVersion(change.version);
      const entry = await store.moderate(change, now());
      return res.status(200).json({ entry });
    }),
  };
}
