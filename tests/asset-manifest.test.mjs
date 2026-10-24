import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { validateAssets } from '../scripts/validate-assets.mjs';

test('all distributed assets match their source and integrity records', async () => {
  assert.equal(await validateAssets(new URL('../', import.meta.url)), 89);
});

test('asset validation rejects changed files, missing attribution and unsafe paths', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'racing-assets-'));
  try {
    await mkdir(path.join(root, 'assets'));
    await writeFile(path.join(root, 'assets', 'sample.bin'), 'sample');
    const entry = { file: 'assets/sample.bin', bytes: 6, sha256: createHash('sha256').update('sample').digest('hex'), source: 'Test author / asset', source_url: 'https://example.com/asset', license: 'CC0', changes: 'Unchanged' };
    const manifest = path.join(root, 'assets', 'manifest.json');
    await writeFile(manifest, JSON.stringify([entry]));
    assert.equal(await validateAssets(root), 1);
    for (const patch of [{ sha256: '0'.repeat(64) }, { source: '' }, { license: '' }, { source_url: 'javascript:alert(1)' }, { file: 'assets/../../outside.bin' }, { file: 'assets/../secret.bin' }, { file: 'assets/missing.bin' }]) {
      await writeFile(manifest, JSON.stringify([{ ...entry, ...patch }]));
      await assert.rejects(validateAssets(root));
    }
    await writeFile(manifest, JSON.stringify([entry, entry]));
    await assert.rejects(validateAssets(root), /Duplicate/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
