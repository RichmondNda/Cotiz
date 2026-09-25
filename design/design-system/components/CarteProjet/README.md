# CarteProjet

Carte projet en deux vues : gestionnaire (collecte ou remplissage) et souscripteur (reste à payer).

- Gestionnaire : nom, fréquence et montant, statut, barre d'avancement (en cours : collecté / attendu en `brand` ; inscriptions ouvertes : inscrits / requis en `info`), avatars empilés, alerte de retards. Variantes brouillon (pointillé neutre) et terminé (grisé, « Voir le bilan »).
- Souscripteur (`--member`) : le **reste à payer** domine en `amount-card`. À jour : bordure standard ; en retard (`--late`) : bordure `danger` 2 px, montant en `danger-fg` ; signature attendue (`--sign`) : pointillé `warning`, contenu masqué ; terminé (`--done`) : grisé.
- Tri souscripteur : en retard, puis signature attendue, puis date de prochaine échéance. Clic : détail du projet.
