import { cp, mkdir } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const output = new URL('public/', root);
await mkdir(output, { recursive: true });
for (const item of ['index.html', 'styles.css', 'src', 'vendor', 'assets', 'licenses']) {
  await cp(new URL(item, root), new URL(item, output), { recursive: true });
}
console.log('Static game copied to public; server code and credentials stay private.');
