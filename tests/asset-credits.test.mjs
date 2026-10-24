import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));

test('production site publishes a reachable page with complete CC BY attributions', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: root, stdio: 'ignore' });

  const page = readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.match(page, /href="credits\.html"[^>]*>素材与授权/);
  assert.match(page, /aria-label="单座赛车起步与刹停挑战"/);
  assert.doesNotMatch(page, /aria-label="F1 起步刹停挑战"/);

  const credits = readFileSync(path.join(root, 'public', 'credits.html'), 'utf8');
  assert.match(credits, /Sport News Music/);
  assert.match(credits, /Luis Humanoide/);
  assert.match(credits, /https:\/\/freesound\.org\/people\/humanoide9000\/sounds\/769113/);
  assert.match(credits, /https:\/\/creativecommons\.org\/licenses\/by\/4\.0/);
  assert.match(credits, /F1 2022/);
  assert.match(credits, /Blender458/);
  assert.match(credits, /RM-RAIN-MASTER/);
  assert.match(credits, /材质|颜色|方向|缩放|修改/);
  assert.match(credits, /商标或其他权利/);
  assert.match(credits, /Ears68/);
  assert.match(credits, /Quaternius/);
});
