#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

const isLinux = process.platform === 'linux';
const isX64 = process.arch === 'x64';

if (!isLinux || !isX64) {
  process.exit(0);
}

const require = createRequire(import.meta.url);

try {
  // If the module already exists, no action needed.
  require.resolve('@rollup/rollup-linux-x64-gnu');
  process.exit(0);
} catch {
  // continue to install
}

console.log('▶ Installing @rollup/rollup-linux-x64-gnu (pre-build workaround)');

try {
  execSync('npm install --no-save @rollup/rollup-linux-x64-gnu', {
    stdio: 'inherit',
  });
} catch (error) {
  console.error('Failed to install @rollup/rollup-linux-x64-gnu:', error);
  process.exit(1);
}

