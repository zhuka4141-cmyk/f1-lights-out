import { isScoringResult } from './core.mjs';
import { normalizePlayerName } from './player-name.mjs';

export class OnlineLeaderboard {
  constructor() { this.entries = []; this.playerName = ''; this.run = Promise.resolve(null); this.offer(null); }
  offer(result, drive) {
    this.result = isScoringResult(result) ? result : null; this.saved = false;
    this.proof = this.result && drive ? { ms: result.ms, finishMs: result.finishMs, distanceCm: result.distanceCm,
      duration: drive.elapsed, inputs: drive.inputs.map(sample => [...sample]) } : null;
  }
  async request(path, options = {}) {
    let response;
    try { response = await fetch(path, { credentials: 'same-origin', ...options, signal: AbortSignal.timeout(25000) }); }
    catch { throw new Error('网络连接失败，请稍后重试。'); }
    let data; try { data = await response.json(); } catch { throw new Error('在线排行榜暂时不可用，请稍后重试。'); }
    if (!response.ok) throw new Error(data.error || '在线排行榜暂时不可用，请稍后重试。');
    return data;
  }
  startRun(name) {
    this.playerName = normalizePlayerName(name);
    this.run = this.request('/api/runs', { method: 'POST', headers: { 'Content-Type':'application/json' },
      body:JSON.stringify({ name:this.playerName }) });
    return this.run;
  }
  async load() {
    const data = await this.request('/api/leaderboard', { cache: 'no-store' });
    if (!Array.isArray(data.entries)) throw new Error('排行榜数据暂时无法读取。');
    this.entries = data.entries; return this.entries;
  }
  async save(name = this.playerName) {
    if (this.saved) throw new Error('本轮已经记录。');
    if (!this.result || !this.proof) throw new Error('只有有效刹停才能上榜。');
    const trimmed = normalizePlayerName(name);
    if (this.playerName && trimmed !== this.playerName) throw new Error('请使用本轮开始时的名字记录成绩。');
    const run = await this.run;
    if (!run) throw new Error('起步时未连上排行榜，本轮无法提交，请联网后重新挑战。');
    const data = await this.request('/api/leaderboard', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: trimmed, token: run.token, proof: this.proof }) });
    this.entries = data.entries; this.saved = true; return data.entry;
  }
}
