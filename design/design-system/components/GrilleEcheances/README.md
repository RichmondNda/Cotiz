# GrilleEcheances

La grille d'échéances : une ligne par souscripteur, une case par échéance — le composant signature de Cotiz.

- Case 22×22, `r-xs` : payée `success`, déclarée à valider `warning`, partielle demi `success` / demi `cell-future`, en retard `danger`, à venir `cell-future`.
- Survol : infobulle « Juillet 2026 · 25 000 F · En retard depuis 58 jours ». Clic : panneau latéral avec le détail et les paiements rattachés ; case orange = accès direct à la validation.
- Colonne souscripteur figée ; au-delà de 12 échéances, défilement horizontal positionné sur le mois courant, surligné `brand-pale`.
- Tri par défaut : plus grand nombre de retards en haut. Colonne « Reste » alignée à droite, en `danger-fg` gras si retard.
- Accessibilité : option « Afficher les motifs » (✓ payée, ! retard, ◔ partielle, … déclarée). Mobile : une carte par souscripteur, cases qui passent à la ligne.
- Fournir : la liste des souscripteurs avec, pour chaque échéance, `{mois, montant, statut}`.
