export function normalizePlayerName(value) {
  const name = typeof value === 'string' ? value.normalize('NFKC').trim() : '';
  if (!name || [...name].length > 20 || /[\p{Cc}\p{Cf}]/u.test(name)) {
    throw new Error('请输入名字，最多 20 个字。 / Enter a name, up to 20 characters.');
  }
  return name;
}
