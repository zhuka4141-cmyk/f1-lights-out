import { cp, mkdir } from 'node:fs/promises';
import { validateAssets } from './validate-assets.mjs';
const root = new URL('../', import.meta.url);
console.log(`Verified ${await validateAssets(root)} asset source and integrity records.`);
const output = new URL('public/', root);
await mkdir(output, { recursive: true });
for (const item of ['index.html', 'styles.css', 'credits.html', 'credits.css', 'src', 'vendor', 'assets', 'licenses', 'admin']) {
  await cp(new URL(item, root), new URL(item, output), { recursive: true });
}
console.log('Static game copied to public; server code and credentials stay private.');
