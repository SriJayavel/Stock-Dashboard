import { spawnSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, type, release, version } from 'node:os';
import { fileURLToPath } from 'node:url';

const cwd = fileURLToPath(new URL('../', import.meta.url));
const report = new URL('../BENCHMARKS.md', import.meta.url);
const python = process.env.MARA_PYTHON || 'python';
const browserMarker = '<!-- Browser audit -->';

function run(command, ...args) {
  const result = spawnSync(command, args, {
    cwd, encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed\n${result.stdout}\n${result.stderr}`);
  return result.stdout.trim();
}

const cache = run(python, '-m', 'benchmarks.benchmark_cache');
const failover = run(python, '-m', 'benchmarks.failover_sim');
const indicators = run(process.execPath, 'benchmarks/verify_indicators.mjs');
if (indicators.includes('[FAIL]')) throw new Error(indicators);
const reference = run(process.execPath, 'benchmarks/verify_reference.mjs');
const field = (pattern) => {
  const match = cache.match(pattern);
  if (!match) throw new Error(`Missing cache result for ${pattern}`);
  return match[1];
};
const requests = field(/Total Requests:\s*(.+)/);
const throughput = field(/Throughput:\s*(.+)/);
const hitRate = field(/Cache Hit Rate:\s*(.+)/);
const latency = ['p50', 'p90', 'p95', 'p99'].map((label) => {
  const value = field(new RegExp(`^ +${label}(.*)`, 'm'));
  return `${label} ${value.split(':')[1].trim()}`;
}).join(' · ');
const [, rate, hits, misses] = hitRate.match(/([\d.]+%) \(([\d,]+) hits \/ ([\d,]+) misses\)/);
const maxError = Math.max(...[...indicators.matchAll(/Max Error: ([\de+.-]+)/g)].map((match) => Number(match[1])));
const previous = await readFile(report, 'utf8').catch((error) => {
  if (error.code === 'ENOENT') return '';
  throw error;
});
const browserAudit = previous.includes(browserMarker) ? previous.slice(previous.indexOf(browserMarker)) : '';
const output = [
  '# MARA benchmarks',
  '',
  `Run on ${new Date().toISOString().slice(0, 10)} UTC with ${cpus()[0].model}, ${type()} ${release()} (${version()}), ${run(python, '--version')} and Node ${process.version}.`,
  '',
  'Run `npm run benchmark` from the repository root to regenerate this report. It uses NumPy and pandas from `backend/requirements.txt`.',
  '',
  '| Measurement | Result | Scope |',
  '| --- | --- | --- |',
  `| Simulated L1 workload throughput | ${throughput} | One process and one sequential asyncio worker, ${requests} iterations. Wall-clock time includes NumPy symbol sampling, cache lookups, and bookkeeping. No HTTP, Redis, or serialization. |`,
  `| In-process L1 lookup latency | ${latency} | Same worker and iterations. Per-request clock surrounds the awaited memory cache lookup. No HTTP, Redis, symbol sampling, or serialization. |`,
  `| Simulated hit rate | ${hitRate} | Eight prewarmed symbols out of ten. No production traffic. |`,
  `| Indicator formula checks | ${maxError.toExponential(4)} max absolute error | SMA, EMA, and Bollinger series checks, plus an RSI bounds check. Bollinger reuses the app’s helpers. See the independent pandas check below. |`,
  '| Provider fallback | Passed | Offline composite quote routing with injected HTTP 403 and timeout errors. L1 was checked separately in isolation. |',
  '',
  `The workload samples a fixed, power-law-style popularity profile with weights \`[0.25, 0.20, 0.15, 0.10, 0.10, 0.05, 0.05, 0.05, 0.025, 0.025]\`. If each uncached lookup required an upstream call, the simulated reduction versus no cache would be (${requests} − ${misses}) ÷ ${requests} = ${hits} ÷ ${requests} = ${rate}. The previous “over 88%” figure had no separate measurement in this harness. The script uses unseeded sampling, so timings and hit counts vary.`,
  '',
  'The failover simulation covers composite single-quote routing. It does not exercise a Redis disconnect or measure circuit-breaker state transitions.',
];
for (const [command, result] of [
  ['python -m benchmarks.benchmark_cache', cache],
  ['python -m benchmarks.failover_sim', failover],
  ['node benchmarks/verify_indicators.mjs', indicators],
  ['node benchmarks/verify_reference.mjs', reference],
]) {
  output.push('', `### \`${command}\``, '', '```text', result.replaceAll('\r\n', '\n'), '```');
}
if (browserAudit) output.push('', browserAudit.trimEnd());
await writeFile(report, output.join('\n') + '\n');
console.log(output.filter((line) => line.startsWith('|')).join('\n'));
