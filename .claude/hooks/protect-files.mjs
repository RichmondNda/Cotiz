// Bloque (code 2) : modification d'une migration déjà commitée, écriture dans un .env ou dans design/ (lecture seule),
// ajout d'un SDK de fournisseur externe hors du groupe 6.
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const input = JSON.parse(readFileSync(0, 'utf8'));
const file = input.tool_input?.file_path ?? '';
const root = process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
const rel = path.relative(root, file).split(path.sep).join('/');
const block = (msg) => { process.stderr.write(msg + '\n'); process.exit(2); };

if (/(^|\/)\.env(\.|$)/.test(rel)) block(`Écriture interdite dans ${rel} : les secrets sont gérés hors du dépôt.`);

if (/^design\//.test(rel)) block(`${rel} : design/ est la maquette validée, en lecture seule (CLAUDE.md, règle 11).`);

if (/^packages\/db\/migrations\/.+\.sql$/.test(rel)) {
  try {
    execSync(`git cat-file -e HEAD:${rel}`, { cwd: root, stdio: 'ignore' });
    block(`${rel} est déjà commitée : une migration appliquée ne se modifie pas. Crée une nouvelle migration.`);
  } catch { /* fichier nouveau : autorisé */ }
}

const content = input.tool_input?.content ?? input.tool_input?.new_string ?? '';
if (/package\.json$/.test(rel)) {
  const forbidden = ['twilio', '@sendgrid', 'nodemailer', 'postmark', '@getbrevo', 'africastalking', 'stripe', 'cinetpay', '@hcaptcha', 'turnstile', 'recaptcha'];
  // Au démarrage d'un lot du groupe 6 (6.1, 6.2, 6.3), ajouter ici le paquet explicitement autorisé.
  const ALLOWED = [];
  const hit = forbidden.find((p) => content.includes(`"${p}`) && !ALLOWED.includes(p));
  if (hit) block(`Dépendance « ${hit} » refusée : aucun fournisseur externe hors du groupe 6 (CLAUDE.md, règle 6). En lot 6.x, ajoute-la à ALLOWED dans .claude/hooks/protect-files.mjs.`);
}
process.exit(0);
