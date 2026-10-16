import { rankLeaderboard } from './core.mjs';

export function renderLeaderboard(entries, selectedId = null) {
  document.getElementById('boardEmpty').hidden = entries.length > 0;
  document.getElementById('boardTable').hidden = !entries.length;
  const boards = [
    ['distanceRankRows', 'distanceCm', value => `${(value / 100).toFixed(2)} m`],
    ['reactionRankRows', 'ms', value => `${value} ms`],
    ['completionRankRows', 'finishMs', value => `${(value / 1000).toFixed(3)} s`],
    ['scoreRankRows', 'score', value => value.toFixed(2)],
  ];
  for (const [id, metric, format] of boards) {
    const target = document.getElementById(id); target.replaceChildren();
    for (const entry of rankLeaderboard(entries, metric)) {
      const row = document.createElement('tr');
      row.classList.toggle('selected', entry.id === selectedId);
      for (const value of [String(entry.rank).padStart(2, '0'), entry.name, format(entry[metric])]) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      target.append(row);
    }
  }
}
