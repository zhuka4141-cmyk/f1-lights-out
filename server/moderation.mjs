import { RULES, isScoringResult, overallScore } from '../src/core.mjs';
import { normalizeName, PublicError } from './protocol.mjs';

export function editableValues(entry) {
  const { name, distanceCm, ms, finishMs, totalMs } = entry;
  return { name, distanceCm, ms, finishMs, totalMs };
}
export function validateValues(values, roadblockGap = RULES.roadblockGap) {
  const keys = ['name', 'distanceCm', 'ms', 'finishMs', 'totalMs'];
  if (!values || typeof values !== 'object' || Array.isArray(values)
    || Object.keys(values).length !== keys.length || Object.keys(values).some(key => !keys.includes(key))) {
    throw new PublicError('修改内容不完整，请刷新后重试。');
  }
  const normalized = { ...values, name: normalizeName(values.name), offsetCm: -values.distanceCm || 0 };
  if (!isScoringResult({ ...normalized, type: 'valid' }, roadblockGap) || values.totalMs > 610000) {
    throw new PublicError(`成绩数值无效：距离为 0–${roadblockGap} 米，反应为 0–10000 毫秒，冲线时间需符合赛程，停车用时不能小于冲线时间。`);
  }
  return { ...editableValues(normalized), offsetCm: normalized.offsetCm,
    score: Math.round(overallScore(normalized, roadblockGap) * 100) / 100 };
}
export function applyModeration(entries, state = {}) {
  return entries.map(original => {
    const update = state.records?.[original.id];
    return { ...original, ...(update?.values || {}), revision: update?.revision || 0,
      deleted: !!update?.deleted, edited: !!update?.values, updatedAt: update?.updatedAt || original.at };
  });
}
export function changeModeration(state, original, change, now, roadblockGap = RULES.roadblockGap) {
  if (!['edit', 'delete', 'restore'].includes(change?.action)) throw new PublicError('未知的管理操作。');
  if (!Number.isSafeInteger(change.revision) || change.revision < 0) throw new PublicError('记录版本无效，请刷新后重试。');
  const previous = state.records?.[original.id] || { revision: 0, deleted: false };
  if (change.revision !== previous.revision) throw new PublicError('这条成绩已被修改，请刷新后重新操作。', 409);
  if (change.action === 'edit' && previous.deleted) throw new PublicError('请先恢复这条已删除的成绩。', 409);
  if (change.action === 'delete' && previous.deleted) throw new PublicError('这条成绩已在回收站。', 409);
  if (change.action === 'restore' && !previous.deleted) throw new PublicError('这条成绩不在回收站。', 409);
  const next = { ...previous, revision: previous.revision + 1, updatedAt: now };
  if (change.action === 'edit') next.values = validateValues(change.values, roadblockGap);
  else next.deleted = change.action === 'delete';
  const before = { ...original, ...(previous.values || {}) }, after = { ...original, ...(next.values || {}) };
  const event = { id: original.id, playerId: original.playerId, name: after.name, action: change.action,
    at: now, revision: next.revision, before: editableValues(before), after: editableValues(after) };
  return { records: { ...state.records, [original.id]: next }, audit: [...(state.audit || []), event].slice(-200) };
}
