import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { PublicError, sign, unsign } from './protocol.mjs';

export const ADMIN_COOKIE = 'ddg_admin', SESSION_SECONDS = 8 * 60 * 60;
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  const hash = scryptSync(password, salt, 32, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export function verifyPassword(password, encoded) {
  if (typeof password !== 'string' || password.length > 128 || !/^scrypt:[a-f0-9]{32}:[a-f0-9]{64}$/.test(encoded || '')) return false;
  const [, salt, expected] = encoded.split(':');
  const actual = scryptSync(password, salt, 32, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
const sessionKey = (secret, passwordHash) => createHmac('sha256', secret).update(`admin-session:${passwordHash}`).digest('hex');
export function issueAdminSession(secret, passwordHash, now) {
  const session = { role: 'admin', issuedAt: now, expiresAt: now + SESSION_SECONDS * 1000, nonce: randomBytes(16).toString('hex') };
  return sign(Buffer.from(JSON.stringify(session)).toString('base64url'), sessionKey(secret, passwordHash));
}
export function authenticated(req, secret, passwordHash, now) {
  if (!secret || !passwordHash) return false;
  const raw = (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${ADMIN_COOKIE}=`));
  const data = unsign(raw?.slice(ADMIN_COOKIE.length + 1), sessionKey(secret, passwordHash));
  try {
    const session = JSON.parse(Buffer.from(data || '', 'base64url').toString());
    return session.role === 'admin' && Number.isSafeInteger(session.issuedAt) && Number.isSafeInteger(session.expiresAt)
      && session.issuedAt <= now && session.expiresAt > now && session.expiresAt - session.issuedAt === SESSION_SECONDS * 1000;
  } catch { return false; }
}
export function adminCookie(req, token = '') {
  const local = /^(localhost|127\.0\.0\.1):/.test(req.headers.host || '');
  return `${ADMIN_COOKIE}=${token}; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_SECONDS : 0}${local ? '' : '; Secure'}`;
}
export function assertAdmin(req, secret, passwordHash, now) {
  if (!authenticated(req, secret, passwordHash, now)) throw new PublicError('请先登录管理后台。', 401);
}
export function loginFingerprint(req, secret) {
  const ip = req.headers['x-vercel-forwarded-for'] || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown';
  return createHmac('sha256', secret).update(`admin-login:${String(ip).split(',')[0]}`).digest('hex');
}
