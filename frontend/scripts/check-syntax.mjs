import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

for (const directory of ['src', 'scripts', 'tests']) {
  const files = readdirSync(directory, { recursive: true })
    .filter((file) => /\.[cm]?js$/.test(file));
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', join(directory, file)], { stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exitCode = 1;
  }
}
