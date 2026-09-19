import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const SKIP = new Set(['node_modules', '.git', 'dist', 'data', 'coverage', '.cursor']);
const SOURCE_EXT = /\.(?:js|jsx|mjs|cjs)$/i;

function walkSourceFiles(dir, out = []) {
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (out.length > 80) return out;
      walkSourceFiles(abs, out);
    } else if (SOURCE_EXT.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

export function clientScanRoot(repoRoot, { release, cwd } = {}) {
  const fromRelease = String(release || '').split('@')[0].trim();
  const candidates = [
    cwd,
    fromRelease ? path.join(repoRoot, fromRelease) : '',
    path.join(repoRoot, 'shop-api'),
  ].filter(Boolean);
  for (const dir of candidates) {
    const src = path.join(dir, 'src');
    if (fs.existsSync(src) && fs.statSync(src).isDirectory()) return dir;
  }
  return repoRoot;
}

export function findLocalParseErrors(repoRoot, { release, cwd } = {}) {
  const scanRoot = clientScanRoot(repoRoot, { release, cwd });
  const files = walkSourceFiles(path.join(scanRoot, 'src'));
  const broken = [];
  for (const abs of files) {
    const checked = spawnSync(process.execPath, ['--check', abs], {
      encoding: 'utf8',
      timeout: 4000,
    });
    if (checked.status === 0) continue;
    const rel = path.relative(repoRoot, abs).replace(/\\/g, '/');
    if (!rel || rel.startsWith('..')) continue;
    broken.push({
      path: rel,
      abs,
      contents: fs.readFileSync(abs, 'utf8'),
      detail: String(checked.stderr || checked.stdout || '').slice(0, 800),
    });
    if (broken.length >= 4) break;
  }
  return broken;
}

export function applyLocalFiles(repoRoot, files) {
  for (const file of files) {
    const abs = path.resolve(repoRoot, file.path);
    if (!abs.startsWith(path.resolve(repoRoot))) continue;
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, file.contents, 'utf8');
  }
}
