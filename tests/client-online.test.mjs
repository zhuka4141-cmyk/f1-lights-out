import test from 'node:test';
import assert from 'node:assert/strict';
import { OnlineLeaderboard } from '../src/online.mjs';
import { DriveChallenge } from '../src/core.mjs';
import { normalizePlayerName } from '../src/player-name.mjs';

function finishedRace() {
  const d = new DriveChallenge(); d.launch(213); d.setThrottle(true); d.step(6.8); d.setThrottle(false);
  while (!d.finishCrossed && !d.result) {
    if (d.speed * 3.6 < 240) d.setThrottle(true);
    if (d.speed * 3.6 > 248) d.setThrottle(false);
    d.step(.01);
  }
  d.step(2.45); d.setBraking(true); d.step(.7); d.setBraking(false); d.step(.7); d.setBraking(true); d.step(20);
  return d;
}
function transport(t, failSave = false) {
  const original = globalThis.fetch, calls = []; let failures = failSave ? 1 : 0;
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options.body); calls.push({ url, body });
    if (url === '/api/runs') return new Response(JSON.stringify({ token:'signed-test-ticket',name:body.name }));
    if (failures-- > 0) throw new Error('Connection lost');
    const entry = { id:'test-round',name:body.name };
    return new Response(JSON.stringify({ entry,entries:[entry] }));
  };
  t.after(() => { globalThis.fetch = original; });
  return calls;
}

test('a blank, hidden or overlong player name cannot request a race ticket', t => {
  const calls = transport(t), board = new OnlineLeaderboard();
  for (const name of [null,'','  ','\u200b','王\n王','王'.repeat(21)]) assert.throws(() => board.startRun(name),/名字/);
  assert.equal(calls.length,0);
  assert.equal(normalizePlayerName('  Ｗ王  '),'W王');
  assert.equal(normalizePlayerName('😀'.repeat(20)),'😀'.repeat(20));
});

test('a valid result saves automatically under its starting name without another consent step', async t => {
  const calls = transport(t), board = new OnlineLeaderboard(), d = finishedRace();
  await board.startRun('  Ｗ王  '); board.offer(d.result,d);
  const saved = await board.save();
  assert.equal(saved.name,'W王'); assert.equal(board.saved,true);
  assert.equal(calls[0].body.name,'W王'); assert.equal(calls[1].body.name,'W王');
  assert.equal(calls[1].body.token,'signed-test-ticket');
  assert.equal(calls[1].body.proof.finishMs,d.result.finishMs);
  await assert.rejects(board.save(),/已经记录/); assert.equal(calls.length,2);
});

test('failed automatic submission retains the named proof for a safe retry', async t => {
  const calls = transport(t,true), board = new OnlineLeaderboard(), d = finishedRace();
  await board.startRun('朱'); board.offer(d.result,d);
  await assert.rejects(board.save(),/网络连接失败/); assert.equal(board.saved,false);
  const proof = structuredClone(board.proof);
  await board.save(); assert.equal(board.saved,true);
  assert.deepEqual(calls[1].body,calls[2].body); assert.deepEqual(board.proof,proof);
});

test('a round cannot be reassigned to another name and failures cannot upload', async t => {
  const calls = transport(t), board = new OnlineLeaderboard(), d = finishedRace();
  await board.startRun('朱'); board.offer(d.result,d);
  await assert.rejects(board.save('王'),/本轮开始时的名字/); assert.equal(calls.length,1);
  board.offer({ ...d.result,type:'engine-blown' },d);
  await assert.rejects(board.save(),/有效刹停/); assert.equal(calls.length,1);
});
