# Lot 03 — Espace souscripteur

> À lancer dans une session Claude Code neuve (`/clear`), à la racine du repo, avec `/lot 03` ou en collant ce fichier.
> Règles : `CLAUDE.md`. Références : `design/INVENTAIRE.md`, `design/DONNEES-REFERENCE.md`.

## Objectif

Implémente les 12 écrans de l'espace souscripteur (thème `member`, mobile d'abord) dans le layout `souscripteur`.
Utilisateur connecté : Moussa Diarra.

## Écrans

| Écran | Route | États (web / mobile) | Captures |
|---|---|---|---|
| MbOnboarding | `/bienvenue` | 1, 2, 3 | `design/screens/souscripteur/*/MbOnboarding__*.png` |
| MbAccueil | `/accueil  ⚠ voir CLAUDE.md` | nominal, tout-est-paye, aucun-projet | `design/screens/souscripteur/*/MbAccueil__*.png` |
| MbProjet | `/projets/[id]` | en-retard, a-jour, paiement-en-attente, paiement-rejete, termine | `design/screens/souscripteur/*/MbProjet__*.png` |
| MbContrat | `/projets/[id]/contrat` | lecture, case-cochee, signe, consultation | `design/screens/souscripteur/*/MbContrat__*.png` |
| MbDeclarer | `/paiements/declarer` | etape-projet, etape-montant, etape-preuve, etape-recap, cas-paiement-partiel, cas-montant-trop-eleve | `design/screens/souscripteur/*/MbDeclarer__*.png` |
| MbDeclarerOk | `/paiements/declarer/ok` | défaut | `design/screens/souscripteur/*/MbDeclarerOk__*.png` |
| MbHistorique | `/historique` | nominal, filtre-actif, aucun-paiement | `design/screens/souscripteur/*/MbHistorique__*.png` |
| MbAssociations | `/associations` | nominal, une-seule-association | `design/screens/souscripteur/*/MbAssociations__*.png` |
| MbAssociation | `/associations/[id]` | défaut | `design/screens/souscripteur/*/MbAssociation__*.png` |
| MbContrats | `/contrats` | nominal, tout-signe | `design/screens/souscripteur/*/MbContrats__*.png` |
| MbNotifications | `/notifications` | nominal, tout-lu, vide | `design/screens/souscripteur/*/MbNotifications__*.png` |
| MbProfil | `/profil` | défaut | `design/screens/souscripteur/*/MbProfil__*.png` |

## Points d'attention

- Mobile d'abord : vérifie chaque écran en 390 px **avant** le desktop. Desktop = barre latérale + contenu centré 960 px.
- Navigation basse à 4 entrées (Accueil, Projets, Historique, Profil) + bouton flottant « Déclarer un paiement »
  (masqué pendant la déclaration elle-même). Badge de notifications dans l'en-tête.
- Accueil : cartes projet triées (retard, signature, prochaine échéance) ; montant total restant dominant.
- Déclaration (`/paiements/declarer`) : 4 étapes projet → montant → preuve → récapitulatif, état partagé entre étapes
  (composable ou store, pas 4 pages indépendantes). Le **sélecteur d'échéances couvertes** alloue le montant aux échéances
  les plus anciennes d'abord (paiement partiel, montant trop élevé : voir les états `cas`). Depuis une carte projet, le
  projet est pré-sélectionné (`?projet=`). Envoi → `POST /api/declarations` → `/paiements/declarer/ok`.
- Contrat : lecture → case cochée → signé ; « Signer » désactivé tant que la case n'est pas cochée.
- Historique : filtres (état `filtre-actif`) et état vide.
- Moussa : reste 395 000 F, 50 000 F en retard sur Centre communautaire (voir l'écart signalé dans DONNEES-REFERENCE).

## Fin de lot

- Chaque état de chaque écran vérifié avec `/verifier-ecran` (web et mobile).
- `/revue-lot 03`, corrections, typecheck + lint.
- Compte rendu : écarts assumés, placeholders restants, questions. Commit : `feat(souscripteur): lot 03 — espace souscripteur`.
