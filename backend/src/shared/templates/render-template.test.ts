import { describe, expect, it } from 'vitest';
import { renderTemplate } from './render-template.js';

/** Lot 4.2 · étape 4 : rendu d'un modèle de message (`{{variable}}`), texte brut, en une seule passe. */
describe('renderTemplate', () => {
  const vars = { projet: 'Centre communautaire', montant: '25\u202f000\u00a0F' };

  it('remplace chaque variable, espaces autour du nom tolérés', () => {
    expect(renderTemplate('Vos {{montant}} pour {{ projet }} sont validés.', vars)).toBe(
      'Vos 25\u202f000\u00a0F pour Centre communautaire sont validés.',
    );
  });

  it('variable inconnue : null (l’appelant garde le texte du code), jamais un trou dans le message', () => {
    expect(renderTemplate('Bonjour {{prenom}}', vars)).toBeNull();
    expect(renderTemplate('{{toString}}', vars)).toBeNull();
  });

  it('une seule passe : une valeur qui contient {{…}} n’est pas réinterprétée', () => {
    expect(renderTemplate('Projet : {{projet}}', { projet: '{{montant}}' })).toBe('Projet : {{montant}}');
  });

  it('caractères de contrôle des valeurs remplacés (pas de saut de ligne injecté) ; texte vide refusé', () => {
    expect(renderTemplate('{{projet}}', { projet: 'A\nB\u0000C' })).toBe('A B C');
    expect(renderTemplate('   ', vars)).toBeNull();
  });
});
