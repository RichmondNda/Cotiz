/**
 * Lecture d'un fichier CSV d'import (RFC 4180) : séparateur `;` (Excel en français), `,` ou tabulation, détecté sur la
 * première ligne ; champs entre guillemets (guillemet doublé, retours à la ligne), fins de ligne CRLF ou LF. Texte en
 * UTF-8 (marque d'ordre retirée), sinon Windows-1252 (enregistrement « CSV » d'Excel). `null` : contenu binaire.
 */
export function parseCsv(content: Buffer): string[][] | null {
  const text = decode(content);
  if (text === null) return null;
  const separator = detectSeparator(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charAt(i);
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === separator) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function decode(content: Buffer): string | null {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    text = new TextDecoder('windows-1252').decode(content);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  // Octets de contrôle (hors tabulation et fins de ligne) : pas un texte.
  // eslint-disable-next-line no-control-regex
  return /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(text) ? null : text;
}

/** Séparateur le plus fréquent de la première ligne, hors guillemets ; `;` par défaut (une seule colonne). */
function detectSeparator(text: string): string {
  const counts = new Map<string, number>([
    [';', 0],
    [',', 0],
    ['\t', 0],
  ]);
  let quoted = false;
  for (const c of text) {
    if (c === '"') quoted = !quoted;
    else if (!quoted && (c === '\n' || c === '\r')) break;
    else if (!quoted && counts.has(c)) counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  let best = ';';
  for (const [separator, n] of counts) if (n > (counts.get(best) ?? 0)) best = separator;
  return best;
}
