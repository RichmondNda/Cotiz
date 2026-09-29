// Après chaque modification dans backend/, packages/ ou tools/ : Prettier + ESLint sur le fichier touché (non bloquant pour Prettier).
// frontend/ est exclu : il garde @nuxt/eslint (npm run lint) et n'utilise pas Prettier.
// Les erreurs ESLint sont renvoyées à Claude (code 2) pour correction immédiate.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const file = input.tool_input?.file_path;
if (!file || !existsSync(file) || !/\.(ts|tsx|vue|js|mjs|json|md|yaml|yml)$/.test(file)) process.exit(0);
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = path.relative(root, file).split(path.sep).join('/');
if (!/^(backend|packages|tools)\//.test(rel)) process.exit(0);
// Avant le lot 0.1 (outils pas encore installés) : ne rien faire.
if (!existsSync(path.join(root, 'node_modules', '.bin', 'eslint'))) process.exit(0);
try { execFileSync('pnpm', ['exec', 'prettier', '--write', file], { cwd: root, stdio: 'ignore' }); } catch {}
if (/\.(ts|tsx|vue)$/.test(file)) {
  try {
    execFileSync('pnpm', ['exec', 'eslint', '--no-warn-ignored', file], { cwd: root, stdio: 'pipe' });
  } catch (e) {
    process.stderr.write(`ESLint signale des problèmes dans ${file} :\n${e.stdout?.toString() ?? ''}`);
    process.exit(2);
  }
}
process.exit(0);
