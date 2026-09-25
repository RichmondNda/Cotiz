# Données de référence (mocks V0)

Mêmes personnes, mêmes montants partout : un souscripteur doit avoir les mêmes chiffres sur tous les écrans.
Source : section 9 de `specs/cotiz-spec-ui.html` + valeurs réellement affichées dans les maquettes.
Pour le détail ligne par ligne d'un écran, lire le bloc `renderVals()` de `source-maquette/<Écran>.dc.html`.

Les placeholders de la maquette (`[N]`, `[MONTANT]`, `[DATE]`, `[PRIX]`, `[N° FACTURE]`, `[email]`, `[XX XX XX XX]`…)
sont volontaires : ils restent tels quels dans les mocks jusqu'à ce que les vraies valeurs soient fournies.

## Associations

| Association | Ville | Plan | Statut | Projets | Souscripteurs | id |
|---|---|---|---|---|---|---|
| Entraide Yopougon | Abidjan | Essentiel | Active | 3 | 52 | `entraide-yopougon` |
| Association des ressortissants de Man | Abidjan | Pro | Impayée | 5 | 142 | `ressortissants-man` |
| Jeunesse solidaire de Bouaké | Bouaké | Découverte | Onboarding | 0 | 0 | `jeunesse-bouake` |

## Plans d'abonnement

| Plan | Limites (projets / souscripteurs / gestionnaires) | Associations abonnées | Mis en avant |
|---|---|---|---|
| Découverte | [N] / [N] / [N] | 41 | non |
| Essentiel | [N] / [N] / [N] | 78 | oui (« Le plus choisi ») |
| Pro | 5 / 200 / 3 | 28 | non |

Prix : `[PRIX]` partout (non fournis).

## Projets d'Entraide Yopougon

| Projet | Type | Fonds d'entrée | Échéance | Fréquence | Durée | Statut |
|---|---|---|---|---|---|---|
| Centre communautaire | Dates fixes | 50 000 F | 25 000 F | Mensuelle, le 5 | mars 2026 → août 2027 (18) | En cours |
| Tontine solidaire 2027 | Cycle roulant | — | 10 000 F | Mensuelle | dès janvier 2027 | Inscriptions ouvertes (12/30) |
| Voyage solidaire | Dates fixes | 50 000 F | 10 000 F | Mensuelle | 12 mois | En cours |

Engagement par souscripteur : Centre = 50 000 + 18 × 25 000 = **500 000 F** ; Voyage = 50 000 + 12 × 10 000 = **170 000 F**.

### Centre communautaire (projet de référence)

- 52 souscripteurs · 9 594 000 F collectés sur 11 700 000 F attendus à date → **82 %** de recouvrement.
- **14 souscripteurs en retard** · prochaine échéance le 5 oct. 2026.
- 6 paiements à valider au total dans l'association, dont 4 sur Centre communautaire.
- Tableau de bord gestionnaire (mois en cours) : 1 240 000 F collectés sur 1 300 000 F attendus ;
  paiements à valider : 6 (le plus ancien : 3 jours) ; en retard : 14 sur 52 ; taux de recouvrement : 82 %.

## Personnes

| Nom | Rôle | Téléphone | Situation |
|---|---|---|---|
| Awa Koné | Gestionnaire principale d'Entraide Yopougon (trésorière) | +225 07 08 09 10 11 · awa@entraide.ci | Utilisatrice de l'espace gestionnaire |
| Moussa Diarra | Souscripteur, membre de 2 associations | +225 05 44 21 87 90 | Utilisateur de l'espace souscripteur |
| Fatou Traoré | Souscriptrice récente | +225 01 22 33 44 55 | Signature attendue (Centre) |
| Jean Kouassi | Souscripteur | +225 07 55 66 77 88 | Paiement partiel en août |
| Aminata Konaté | Gestionnaire secondaire | — | Apparaît comme « validé par » |
| Richy | Super-admin | — | Utilisateur de l'espace plateforme |

Autres souscripteurs présents dans les maquettes (ajoutés pour remplir les listes) : Koffi Brou, Kadiatou Sanogo,
Serge Gnagne, Ibrahim Touré, Adjoua Yao, Mariam Diallo, Yves Ahoussou, Clarisse Aka, Aïcha Bamba.

### Moussa Diarra (tableau de bord souscripteur)

| Projet | Association | Versé | Reste | Situation |
|---|---|---|---|---|
| Centre communautaire | Entraide Yopougon | 175 000 F | 325 000 F / 500 000 F | 2 échéances en retard depuis le 5 août → **50 000 F** à régulariser |
| Mutuelle santé | Ressortissants de Man | 50 000 F | 70 000 F / 120 000 F | À jour, prochaine 10 000 F le 5 oct. |
| Voyage solidaire | Entraide Yopougon | — | — | Contrat à signer (170 000 F, non compté tant que non signé) |

**Reste total : 395 000 F.** Prochaine échéance : 25 000 F le 5 octobre.

> ⚠ Écart connu : la spec et le README du design system indiquent « 30 000 F en retard ». Les maquettes affichent
> **50 000 F** (2 échéances × 25 000 F, cohérent avec les autres chiffres). **Suivre les maquettes** tant que ce point
> n'est pas tranché.

### Paiements déclarés à valider (file du gestionnaire)

| Souscripteur | Projet | Montant | Déclaré | Moyen | Couvre |
|---|---|---|---|---|---|
| Awa Koné | Centre communautaire | 75 000 F | il y a 3 j | Mobile money | sept., oct., nov. |
| Jean Kouassi | Centre communautaire | 12 500 F | il y a 2 j | Mobile money | solde d'août |
| Kadiatou Sanogo | Centre communautaire | 25 000 F | il y a 2 j | Virement | sept. |
| Serge Gnagne | Centre communautaire | 25 000 F | hier | Mobile money | sept. |
| Ibrahim Touré | Voyage solidaire | 10 000 F | hier | Mobile money | sept. |
| Adjoua Yao | Voyage solidaire | 50 000 F | aujourd'hui | Virement | fonds d'entrée |

### Annuaire (extrait)

| Souscripteur | Projets | Versé | Reste | Statut |
|---|---|---|---|---|
| Moussa Diarra | Centre, Voyage | 175 000 F | 325 000 F | En retard |
| Koffi Brou | Centre | 175 000 F | 325 000 F | En retard |
| Jean Kouassi | Centre | 212 500 F | 287 500 F | En retard |
| Fatou Traoré | Centre | 0 F | 500 000 F | Signature attendue |
| Awa Koné | Centre | 200 000 F | 300 000 F | À jour |
| Kadiatou Sanogo | Centre, Tontine | 200 000 F | 300 000 F | À jour |
| Serge Gnagne | Centre | 200 000 F | 300 000 F | À jour |
| Ibrahim Touré | Voyage | [MONTANT] F | [MONTANT] F | À jour |
| Adjoua Yao | Voyage | 0 F | 170 000 F | À jour |

### Grille d'échéances (Centre communautaire)

Codes utilisés par la maquette (`MgProjetPaiements.dc.html`), un caractère par échéance depuis mars 2026 :
`o` payée · `l` en retard · `W` déclarée, à valider · `P` partielle · `f` à venir.
La 1re cellule est le fonds d'entrée (50 000 F), les suivantes les échéances de 25 000 F (le 5 de chaque mois) ;
au-delà de la séquence, toutes les cellules sont « à venir ».

| Souscripteur | Séquence |
|---|---|
| Moussa Diarra | `ooooooll` |
| Koffi Brou | `ooooooll` |
| Jean Kouassi | `ooooooPo` |
| Awa Koné | `oooooooWWW` |
| Kadiatou Sanogo | `oooooooW` |
| Serge Gnagne | `oooooooW` |
| Fatou Traoré | `f` (contrat non signé) |

## Formats

- Montant : `formatFCFA(25000)` → `25 000 F` (U+202F). Dans les champs : suffixe « F CFA ».
- Dates : `5 oct. 2026`, `05/09/2026` dans les tableaux, relatif (« il y a 3 j », « hier ») dans les files.
- Téléphone : `+225 07 08 09 10 11` (indicatif + groupes de 2).
