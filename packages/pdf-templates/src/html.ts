const ENTITIES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Texte inséré dans le HTML : jamais interprété (noms, modèle de contrat saisis par des personnes). */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}

/** Texte brut en paragraphes : ligne vide = nouveau paragraphe, retour à la ligne = `<br>`. */
export function paragraphs(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
    .map((block) => `<p>${block.split('\n').map(escapeHtml).join('<br>')}</p>`)
    .join('\n');
}
