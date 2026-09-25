# Bouton

Déclenche une action ; sept variantes, trois tailles, six états.

- **Primaire** (`cz-btn`) : l'action principale, un seul par zone visible ; couleur `brand`, survol `brand-dark`.
- **Secondaire** (`--secondary`) : contour 1,5 px `brand`, fond blanc. **Fantôme** (`--ghost`) : annuler, actions tertiaires.
- **Succès** (`--success`) : réservé à « Valider le paiement ». **Danger** (`--danger`) : suppression, toujours suivi d'une modale de confirmation. **Danger contour** (`--danger-outline`) : rejeter un paiement, refuser une demande.
- **Icône** (`--icon`) : 40×40, infobulle obligatoire.
- Tailles `--sm` 34, défaut 42, `--lg` 50 (mobile souscripteur, CTA de landing). Icône 18 px à gauche, écart 8 px.
- États : repos, `:hover`/`.is-hover`, `:focus-visible`/`.is-focus` (halo 3 px `brand-pale`), `:active`/`.is-active`, `.is-loading` (spinner `cz-spin` + libellé au participe présent), `disabled`.
- Mobile : les actions principales passent en pleine largeur (`--block`) en bas d'écran. `cz-fab` : bouton flottant corail « Déclarer un paiement ».
