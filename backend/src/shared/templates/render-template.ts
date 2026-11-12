/**
 * Modèles de messages (message_templates, lot 4.2) : `{{variable}}` remplacé par une valeur déjà mise en forme
 * (`RenderedMessage.vars`). Texte brut (cloche, push) : affiché comme texte, jamais comme HTML. Une seule passe, si bien
 * qu'une valeur ne peut pas introduire d'autre variable ; caractères de contrôle des valeurs remplacés par une espace.
 * Variable inconnue ou résultat vide : `null`, l'appelant garde le texte du code (jamais un message à trous).
 */
const PLACEHOLDER = /\{\{\s*([a-zA-Z][\w]*)\s*\}\}/g;
// eslint-disable-next-line no-control-regex -- on retire précisément les caractères de contrôle
const CONTROL = /[\u0000-\u001f\u007f]+/g;

export function renderTemplate(template: string, vars: Readonly<Record<string, string>>): string | null {
  const missing: string[] = [];
  const out = template.replace(PLACEHOLDER, (_, name: string) => {
    const value = Object.hasOwn(vars, name) ? vars[name] : undefined;
    if (value === undefined) {
      missing.push(name);
      return '';
    }
    return value.replace(CONTROL, ' ');
  });
  if (missing.length > 0 || out.trim() === '') return null;
  return out;
}
