import { readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Checks recorded provenance and file integrity, not the legal validity of a license.
export async function validateAssets(root) {
  const directory = await realpath(root instanceof URL ? fileURLToPath(root) : root);
  const manifest = JSON.parse(await readFile(path.join(directory, 'assets/manifest.json'), 'utf8'));
  if (!Array.isArray(manifest) || !manifest.length) throw new Error('Empty asset manifest');
  const seen = new Set();
  for (const asset of manifest) {
    for (const key of ['file', 'source', 'source_url', 'license']) {
      if (typeof asset[key] !== 'string' || !asset[key].trim()) throw new Error(`Missing ${key}: ${asset.file}`);
    }
    if (typeof asset.changes !== 'string') throw new Error(`Missing changes record: ${asset.file}`);
    if (!(asset.file.startsWith('assets/') || asset.file.startsWith('vendor/')) || asset.file.includes(String.fromCharCode(92)) || asset.file.split('/').some(part => part === '..' || part === '.')) throw new Error(`Unsafe asset path: ${asset.file}`);
    if (seen.has(asset.file)) throw new Error(`Duplicate asset: ${asset.file}`);
    seen.add(asset.file);
    const source = new URL(asset.source_url);
    if (!['https:', 'http:'].includes(source.protocol)) throw new Error(`Invalid source URL: ${asset.file}`);
    const file = await realpath(path.join(directory, asset.file));
    const relative = path.relative(directory, file);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Asset escapes project: ${asset.file}`);
    const bytes = await readFile(file);
    const hash = createHash('sha256').update(bytes).digest('hex');
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes !== bytes.length || asset.sha256 !== hash) throw new Error(`Asset integrity mismatch: ${asset.file}`);
  }
  return manifest.length;
}
