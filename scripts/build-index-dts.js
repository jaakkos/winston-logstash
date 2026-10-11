/*
 * Bundles the per-file declarations emitted by `tsc` (TypeScript 7 removed the
 * `outFile` option) into the single `lib/index.d.ts` that has always been
 * published, keeping the shape of the shipped typings unchanged.
 */
const fs = require('fs');
const path = require('path');

const tmpDir = path.join(__dirname, '..', '.types-tmp');
const outFile = path.join(__dirname, '..', 'lib', 'index.d.ts');

// Dependency order (same order the AMD `outFile` bundle used).
const modules = [
  'types',
  'connection',
  'retryable-error',
  'manager',
  'winston-logstash-latest',
  'winston-logstash',
];

const bundled = modules.map((name) => {
  const source = fs.readFileSync(path.join(tmpDir, `${name}.d.ts`), 'utf8');
  const body = source
    .replace(/^\/\/# sourceMappingURL=.*$/gm, '')
    .replace(/^import type /gm, 'import ')
    .replace(/^import \{ type /gm, 'import { ')
    .replace(/from ["']\.\/([^"']+)["']/g, 'from "$1"')
    .replace(/^(export )?declare /gm, '$1')
    .trim()
    .split('\n')
    .map((line) => (line ? `    ${line}` : line))
    .join('\n');
  return `declare module "${name}" {\n${body}\n}\n`;
});

fs.writeFileSync(outFile, bundled.join(''));
fs.rmSync(tmpDir, {recursive: true, force: true});
