import { RULES, overallScore } from '/src/core.mjs';
const $ = id => document.getElementById(id);
let entries = [], audit = [], deletedView = false, page = 0, editing = null, removing = null, busy = false;
const pageSize = 20, dateFormat = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Hong_Kong', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
const short = id => id.slice(0, 8).toUpperCase();
function feedback(id, message = '', error = false) { $(id).textContent = message; $(id).classList.toggle('error', error); }
function showLogin(message = '') {
  $('managerPanel').hidden = true; $('loginPanel').hidden = false;
  $('scoreRows').replaceChildren(); entries = []; audit = [];
  $('editDialog').close(); $('deleteDialog').close(); feedback('loginFeedback', message, !!message);
}
async function request(url, options = {}) {
  let response;
  try { response = await fetch(url, { credentials: 'same-origin', cache: 'no-store', ...options, signal: AbortSignal.timeout(25000) }); }
  catch { throw new Error('网络连接失败，请稍后重试。'); }
  let data; try { data = await response.json(); } catch { throw new Error('后台暂时无法连接，请稍后重试。'); }
  if (!response.ok) {
    if (response.status === 401 && url.startsWith('/api/admin-scores')) showLogin('登录已过期，请重新输入密码。');
    throw new Error(data.error || '操作失败，请稍后重试。');
  }
  return data;
}
function element(tag, text, className) { const node = document.createElement(tag); if (text != null) node.textContent = text; if (className) node.className = className; return node; }
function render() {
  const active = entries.filter(entry => !entry.deleted);
  $('activeCount').textContent = active.length; $('playerCount').textContent = new Set(active.map(entry => entry.playerId)).size;
  $('deletedCount').textContent = entries.length - active.length;
  $('activeTab').setAttribute('aria-pressed', String(!deletedView)); $('deletedTab').setAttribute('aria-pressed', String(deletedView));
  const search = $('searchInput').value.trim().normalize('NFKC').toLowerCase();
  const filtered = entries.filter(entry => entry.deleted === deletedView
    && [entry.name, entry.id, entry.playerId].some(value => value.normalize('NFKC').toLowerCase().includes(search)));
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize)); page = Math.min(page, totalPages - 1);
  const rows = filtered.slice(page * pageSize, (page + 1) * pageSize); $('scoreRows').replaceChildren();
  for (const entry of rows) {
    const row = element('tr'), identity = element('td'), name = element('strong', entry.name);
    identity.append(name, element('small', `玩家 ${short(entry.playerId)} · 成绩 ${short(entry.id)}`));
    if (entry.edited) identity.append(element('small', '已修改'));
    row.append(identity, element('td', `${(entry.distanceCm / 100).toFixed(2)} m`), element('td', `${entry.ms} ms`),
      element('td', `${(entry.finishMs / 1000).toFixed(3)} s`), element('td', overallScore(entry).toFixed(2)), element('td', dateFormat.format(entry.at)));
    const actions = element('div', null, 'row-actions'), cell = element('td');
    const action = (label, callback, className) => { const button = element('button', label, className); button.type = 'button'; button.disabled = busy; button.addEventListener('click', callback); actions.append(button); };
    if (deletedView) action('恢复', () => restore(entry));
    else { action('修改', () => edit(entry)); action('删除', () => remove(entry), 'delete'); }
    cell.append(actions); row.append(cell); $('scoreRows').append(row);
  }
  $('noResults').hidden = rows.length > 0;
  $('pageInfo').textContent = `${filtered.length} 条成绩 · 第 ${page + 1} / ${totalPages} 页`;
  $('previousPage').disabled = page === 0; $('nextPage').disabled = page >= totalPages - 1;
  $('auditRows').replaceChildren();
  for (const event of [...audit].reverse().slice(0, 30)) {
    const action = { edit: '修改', delete: '移入回收站', restore: '恢复' }[event.action];
    $('auditRows').append(element('li', `${dateFormat.format(event.at)} · ${action} · ${event.name} · 成绩 ${short(event.id)}`));
  }
  if (!audit.length) $('auditRows').append(element('li', '暂无管理操作。'));
}
async function load() {
  $('reloadButton').disabled = true; busy = true; render(); feedback('managerFeedback', '正在读取成绩…');
  try {
    const data = await request('/api/admin-scores');
    entries = data.entries; audit = data.audit;
    $('editDistance').max = RULES.roadblockGap;
    $('loginPanel').hidden = true; $('managerPanel').hidden = false; render();
    feedback('managerFeedback', '每行是一局成绩；同名玩家可通过玩家编号区分。');
  } finally { $('reloadButton').disabled = false; busy = false; render(); }
}
function formValues() {
  return { name: $('editName').value, distanceCm: Math.round(Number($('editDistance').value) * 100), ms: Number($('editReaction').value),
    finishMs: Math.round(Number($('editFinish').value) * 1000), totalMs: Math.round(Number($('editTotal').value) * 1000) };
}
function previewScore() { const values = formValues(); $('editScore').textContent = overallScore({ ...values, offsetCm: -values.distanceCm || 0 }).toFixed(2); }
function edit(entry) {
  if (busy) return; editing = entry;
  $('editName').value = entry.name; $('editDistance').value = (entry.distanceCm / 100).toFixed(2);
  $('editReaction').value = entry.ms; $('editFinish').value = (entry.finishMs / 1000).toFixed(3); $('editTotal').value = (entry.totalMs / 1000).toFixed(3);
  $('editIdentity').textContent = `玩家 ${short(entry.playerId)} · 成绩 ${short(entry.id)}`;
  feedback('editFeedback'); previewScore(); $('editDialog').showModal();
}
function remove(entry) {
  if (busy) return; removing = entry;
  $('deleteIdentity').textContent = `${entry.name} · ${(entry.distanceCm / 100).toFixed(2)} m · 成绩 ${short(entry.id)}`;
  feedback('deleteFeedback'); $('deleteDialog').showModal();
}
async function change(entry, action, values) {
  const data = await request('/api/admin-scores', { method: 'PATCH', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: entry.id, revision: entry.revision, action, ...(values ? { values } : {}) }) });
  entries = entries.map(item => item.id === data.entry.id ? data.entry : item);
  audit.push({ id: data.entry.id, name: data.entry.name, action, at: data.entry.updatedAt }); render();
}
async function runChange(entry, action, values, feedbackId, dialog) {
  if (busy) return; busy = true;
  for (const id of ['saveEdit', 'confirmDelete', 'cancelEdit', 'closeEdit', 'cancelDelete', 'logoutButton', 'reloadButton']) $(id).disabled = true;
  feedback(feedbackId, '正在保存…');
  try {
    await change(entry, action, values); dialog?.close();
    feedback('managerFeedback', { edit: '修改已保存，公开排行榜会同步更新。', delete: '成绩已移入回收站，可随时恢复。', restore: '成绩已恢复，重新参与公开排名。' }[action]);
  } catch (error) { feedback(feedbackId, error.message, true); }
  finally {
    busy = false; for (const id of ['saveEdit', 'confirmDelete', 'cancelEdit', 'closeEdit', 'cancelDelete', 'logoutButton', 'reloadButton']) $(id).disabled = false;
    render();
  }
}
function restore(entry) { return runChange(entry, 'restore', null, 'managerFeedback'); }
$('loginForm').addEventListener('submit', async event => {
  event.preventDefault(); $('loginButton').disabled = true; feedback('loginFeedback', '正在登录…');
  try {
    await request('/api/admin-session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: $('adminPassword').value }) });
    $('adminPassword').value = ''; await load();
  } catch (error) { feedback('loginFeedback', error.message, true); }
  finally { $('loginButton').disabled = false; }
});
$('logoutButton').addEventListener('click', async () => {
  try { await request('/api/admin-session', { method: 'DELETE' }); showLogin('已退出登录。'); }
  catch (error) { feedback('managerFeedback', error.message, true); }
});
$('reloadButton').addEventListener('click', () => load().catch(error => feedback('managerFeedback', error.message, true)));
for (const [id, deleted] of [['activeTab', false], ['deletedTab', true]]) $(id).addEventListener('click', () => { deletedView = deleted; page = 0; render(); });
$('searchInput').addEventListener('input', () => { page = 0; render(); });
$('previousPage').addEventListener('click', () => { page--; render(); }); $('nextPage').addEventListener('click', () => { page++; render(); });
$('editForm').addEventListener('input', previewScore);
$('editForm').addEventListener('submit', event => { event.preventDefault(); runChange(editing, 'edit', formValues(), 'editFeedback', $('editDialog')); });
$('deleteForm').addEventListener('submit', event => { event.preventDefault(); runChange(removing, 'delete', null, 'deleteFeedback', $('deleteDialog')); });
for (const id of ['closeEdit', 'cancelEdit']) $(id).addEventListener('click', () => $('editDialog').close());
$('cancelDelete').addEventListener('click', () => $('deleteDialog').close());
for (const id of ['editDialog', 'deleteDialog']) $(id).addEventListener('cancel', event => { if (busy) event.preventDefault(); });
try { const session = await request('/api/admin-session'); if (session.authenticated) await load(); else feedback('loginFeedback'); }
catch (error) { feedback('loginFeedback', error.message, true); }
