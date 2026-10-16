import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { DriveChallenge, isScoringResult, overallScore } from '../src/core.mjs';
import { normalizePlayerName } from '../src/player-name.mjs';

export const BOARD_VERSION = 'sprint250-v11';
export const COOKIE_NAME = 'ddg_player';
export const MAX_RACE_SECONDS = 600;
export class PublicError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const signature = (value, secret) => createHmac('sha256', secret).update(`dragondancegame:${value}`).digest('base64url');
export function sign(value, secret) { return `${value}.${signature(value, secret)}`; }
export function unsign(value, secret) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  const split = value.lastIndexOf('.'); if (split < 1) return null;
  const data = value.slice(0, split), received = Buffer.from(value.slice(split + 1));
  const expected = Buffer.from(signature(data, secret));
  return received.length === expected.length && timingSafeEqual(received, expected) ? data : null;
}
export function playerCookie(req, secret) {
  const raw = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${COOKIE_NAME}=`));
  const id = unsign(raw?.slice(COOKIE_NAME.length + 1), secret);
  return /^[a-f0-9]{32}$/.test(id || '') ? id : null;
}
export function issueRun(playerId, secret, now = Date.now(), name) {
  const ticket = { id: randomBytes(16).toString('hex'), playerId, version: BOARD_VERSION, issuedAt: now,
    ...(name == null ? {} : { name:normalizeName(name) }) };
  return { ticket, token: sign(Buffer.from(JSON.stringify(ticket)).toString('base64url'), secret) };
}
export function verifyRun(token, playerId, secret, now = Date.now()) {
  const data = unsign(token, secret); let ticket;
  try { ticket = JSON.parse(Buffer.from(data || '', 'base64url').toString()); } catch { /* Invalid ticket. */ }
  if (!ticket || ticket.version !== BOARD_VERSION || ticket.playerId !== playerId
    || !/^[a-f0-9]{32}$/.test(ticket.id) || !Number.isSafeInteger(ticket.issuedAt)
    || now < ticket.issuedAt || now - ticket.issuedAt > 2 * 60 * 60 * 1000) {
    throw new PublicError('本轮上榜凭证已失效，请重新挑战。');
  }
  return ticket;
}
export function normalizeName(value) {
  try { return normalizePlayerName(value); }
  catch (error) { throw new PublicError(error.message); }
}
export function replayRace(proof) {
  if (!proof || !Number.isInteger(proof.ms) || proof.ms < 0 || proof.ms > 10000
    || !Number.isFinite(proof.duration) || proof.duration <= 0 || proof.duration > MAX_RACE_SECONDS
    || !Array.isArray(proof.inputs) || !proof.inputs.length || proof.inputs.length > 4096) {
    throw new PublicError('比赛记录不完整，无法上榜，请重新挑战。');
  }
  const drive = new DriveChallenge(); drive.launch(proof.ms); let previous = 0;
  for (const sample of proof.inputs) {
    if (!Array.isArray(sample) || sample.length !== 3 || !Number.isFinite(sample[0])
      || sample[0] < previous || sample[0] > proof.duration
      || typeof sample[1] !== 'boolean' || typeof sample[2] !== 'boolean') {
      throw new PublicError('比赛操作记录无效，请重新挑战。');
    }
    drive.step(sample[0] - previous); previous = sample[0];
    if (drive.result) throw new PublicError('比赛结束后仍有操作，无法上榜。');
    drive.setThrottle(sample[1]); drive.setBraking(sample[2]);
  }
  drive.step(proof.duration - previous + 1e-7);
  if (!isScoringResult(drive.result)) throw new PublicError('只有冲线并在路障前正常刹停才能上榜。');
  const result = drive.result;
  if (Math.abs(result.totalMs - Math.round(proof.ms + proof.duration * 1000)) > 2
    || !Number.isInteger(proof.distanceCm) || Math.abs(result.distanceCm - proof.distanceCm) > 1
    || !Number.isInteger(proof.finishMs) || Math.abs(result.finishMs - proof.finishMs) > 2) {
    throw new PublicError('成绩与比赛过程不一致，请重新挑战。');
  }
  return result;
}
export function entryFor(name, ticket, result) {
  const { ms, finishMs, totalMs, offsetCm, distanceCm } = result;
  return { id: ticket.id, playerId: ticket.playerId, name, ms, finishMs, totalMs, offsetCm, distanceCm,
    score: Math.round(overallScore(result) * 100) / 100, at: ticket.issuedAt };
}
