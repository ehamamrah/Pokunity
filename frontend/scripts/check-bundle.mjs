// Fails the build if dev-only mock code (MSW, fixtures) leaked into the production client bundle.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('../.next/static', import.meta.url).pathname;
const FORBIDDEN = ['setupWorker', 'startMockWorker', 'onUnhandledRequest'];

function filesUnder(dir) {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const leaks = filesUnder(ROOT)
  .filter((file) => file.endsWith('.js'))
  .flatMap((file) => FORBIDDEN.filter((marker) => readFileSync(file, 'utf8').includes(marker)).map((marker) => `${marker} in ${file}`));

if (leaks.length > 0) {
  console.error('Mock code found in the production client bundle:\n' + leaks.join('\n'));
  process.exit(1);
}
console.log('check:bundle ok: no mock code in .next/static');
