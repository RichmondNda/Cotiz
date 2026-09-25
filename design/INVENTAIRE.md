# Inventaire des écrans

Chaque écran de la maquette, sa route Nuxt, ses états, et les fichiers de référence.
Nommage : `screens/<espace>/<web|mobile>/<Écran>__<état>.png` (même chemin en `.html` sous `html/`).
Le premier état listé est l’état par défaut. `web` = 1440 px, `mobile` = 390 px (capture déroulée sur toute la hauteur).

## Espace public

Thème : — (neutre, corail/violet)

| Écran | Route | Description | États web | États mobile |
|---|---|---|---|---|
| **Main** | `/` | Page d’accueil (landing) | `défaut` | `défaut` |
| **Demande** | `/demande` | Demande de création d’association (3 étapes) | `navigable`, `etape1-vide`, `etape2-erreurs`, `etape3-plan`, `envoi-en-cours` | `navigable`, `etape1-vide`, `etape2-erreurs`, `etape3-plan`, `envoi-en-cours` |
| **Confirmation** | `/demande/confirmation` | Confirmation de demande | `défaut` | `défaut` |
| **Connexion** | `/connexion` | Connexion souscripteur (téléphone) | `nominal`, `numero-inconnu`, `mot-de-passe-incorrect`, `premiere-connexion` | `nominal`, `numero-inconnu`, `mot-de-passe-incorrect`, `premiere-connexion` |
| **ConnexionAssociation** | `/connexion/association` | Connexion gestionnaire | `nominal`, `identifiants-incorrects`, `compte-suspendu`, `blocage-15-min`, `chargement` | `nominal`, `identifiants-incorrects`, `compte-suspendu`, `blocage-15-min`, `chargement` |
| **ConnexionPlateforme** | `/connexion/plateforme` | Connexion super-admin | `nominal`, `erreur`, `code-verification` | `nominal`, `erreur`, `code-verification` |
| **MotDePasse** | `/mot-de-passe` | Mot de passe oublié | `navigable`, `code-incorrect`, `code-expire`, `nouveau-mot-de-passe`, `succes` | `navigable`, `code-incorrect`, `code-expire`, `nouveau-mot-de-passe`, `succes` |
| **Legal** | `/legal/[document]` | Pages légales (cgu, confidentialite, mentions) | `cgu`, `confidentialite`, `mentions` | `cgu`, `confidentialite`, `mentions` |

## Espace souscripteur

Thème : `member` (corail)

| Écran | Route | Description | États web | États mobile |
|---|---|---|---|---|
| **MbOnboarding** | `/bienvenue` | Onboarding souscripteur (3 étapes) | `1`, `2`, `3` | `1`, `2`, `3` |
| **MbAccueil** | `/accueil  ⚠ voir CLAUDE.md` | Tableau de bord souscripteur | `nominal`, `tout-est-paye`, `aucun-projet` | `nominal`, `tout-est-paye`, `aucun-projet` |
| **MbProjet** | `/projets/[id]` | Détail d’un projet (souscripteur) | `en-retard`, `a-jour`, `paiement-en-attente`, `paiement-rejete`, `termine` | `en-retard`, `a-jour`, `paiement-en-attente`, `paiement-rejete`, `termine` |
| **MbContrat** | `/projets/[id]/contrat` | Signature / consultation de contrat | `lecture`, `case-cochee`, `signe`, `consultation` | `lecture`, `case-cochee`, `signe`, `consultation` |
| **MbDeclarer** | `/paiements/declarer` | Déclaration de paiement (4 étapes) | `etape-projet`, `etape-montant`, `etape-preuve`, `etape-recap`, `cas-paiement-partiel`, `cas-montant-trop-eleve` | `etape-projet`, `etape-montant`, `etape-preuve`, `etape-recap`, `cas-paiement-partiel`, `cas-montant-trop-eleve` |
| **MbDeclarerOk** | `/paiements/declarer/ok` | Confirmation de déclaration | `défaut` | `défaut` |
| **MbHistorique** | `/historique` | Historique complet | `nominal`, `filtre-actif`, `aucun-paiement` | `nominal`, `filtre-actif`, `aucun-paiement` |
| **MbAssociations** | `/associations` | Mes associations | `nominal`, `une-seule-association` | `nominal`, `une-seule-association` |
| **MbAssociation** | `/associations/[id]` | Détail d’une association | `défaut` | `défaut` |
| **MbContrats** | `/contrats` | Mes contrats | `nominal`, `tout-signe` | `nominal`, `tout-signe` |
| **MbNotifications** | `/notifications` | Notifications | `nominal`, `tout-lu`, `vide` | `nominal`, `tout-lu`, `vide` |
| **MbProfil** | `/profil` | Profil et paramètres | `défaut` | `défaut` |

## Espace gestionnaire

Thème : `manager` (violet)

| Écran | Route | Description | États web | États mobile |
|---|---|---|---|---|
| **MgOnboarding** | `/asso/bienvenue` | Onboarding association (4 étapes) | `1-bienvenue`, `2-association`, `3-paiements`, `4-pret` | `1-bienvenue`, `2-association`, `3-paiements`, `4-pret` |
| **MgDashboard** | `/asso` | Tableau de bord gestionnaire | `nominal`, `premier-usage` | `nominal`, `premier-usage` |
| **MgProjets** | `/asso/projets` | Liste des projets | `nominal`, `vide`, `filtre-sans-resultat` | `nominal`, `vide`, `filtre-sans-resultat` |
| **MgNouveauProjet** | `/asso/projets/nouveau` | Création de projet (6 étapes + succès) | `1`, `2`, `3`, `4`, `5`, `6`, `succes` | `1`, `2`, `3`, `4`, `5`, `6`, `succes` |
| **MgProjet** | `/asso/projets/[id]` | Détail projet — Vue d’ensemble | `en-cours`, `inscriptions-ouvertes`, `termine`, `aucun-retard` | `en-cours`, `inscriptions-ouvertes`, `termine`, `aucun-retard` |
| **MgProjetSouscripteurs** | `/asso/projets/[id]/souscripteurs` | Détail projet — Souscripteurs | `etat-nominal`, `etat-aucun-souscripteur`, `etat-selection-multiple`, `modale-telephone`, `modale-compte-existant`, `modale-nouveau`, `modale-deja-inscrit` | `nominal`, `aucun-souscripteur`, `retrait-confirmation` |
| **MgAjoutSouscripteur** | `/asso/projets/[id]/souscripteurs (modale)` | Ajout d’un souscripteur (modale / feuille, 4 cas) | `telephone`, `compte-existant`, `nouveau`, `deja-inscrit` | `telephone`, `compte-existant`, `nouveau`, `deja-inscrit` |
| **MgProjetPaiements** | `/asso/projets/[id]/paiements` | Détail projet — Paiements (grille d’échéances) | `grille-nominale`, `beaucoup-de-retards`, `panneau-echeance`, `vue-liste` | `grille-nominale`, `detail-echeance`, `vue-liste` |
| **MgProjetContrat** | `/asso/projets/[id]/contrat` | Détail projet — Contrat | `nominal`, `tous-signes` | `nominal`, `tous-signes` |
| **MgProjetParametres** | `/asso/projets/[id]/parametres` | Détail projet — Paramètres | `défaut` | `nominal`, `confirmation-cloture`, `enregistre` |
| **MgProjetRapports** | `/asso/projets/[id]/rapports` | Détail projet — Rapports | `nominal`, `graphiques-bientot-disponibles` | `nominal`, `graphiques-bientot-disponibles` |
| **MgImport** | `/asso/projets/[id]/import` | Import Excel (4 étapes) | `1-fichier`, `fichier-invalide`, `2-colonnes`, `3-verification`, `4-envoi`, `import-termine` | `1-fichier`, `fichier-invalide`, `2-colonnes`, `3-verification`, `4-envoi`, `import-termine` |
| **MgPaiements** | `/asso/paiements` | File de validation des paiements | `file-pleine`, `file-vide`, `valides` | `file-pleine`, `file-vide`, `valides` |
| **MgPaiement** | `/asso/paiements/[id]` | Détail d’un paiement déclaré | `image`, `pdf`, `reference-seule`, `repartition-ajustee`, `modale-rejet`, `valide` | `image`, `reference-seule`, `repartition-ajustee`, `rejet`, `valide` |
| **MgSouscripteurs** | `/asso/souscripteurs` | Annuaire des souscripteurs | `nominal`, `vide` | `nominal`, `vide` |
| **MgSouscripteur** | `/asso/souscripteurs/[id]` | Fiche souscripteur | `en-retard`, `a-jour`, `contrat-non-signe` | `en-retard`, `a-jour`, `contrat-non-signe` |
| **MgRelances** | `/asso/relances` | Relances | `nominal`, `modale-relance`, `relance-envoyee`, `aucun-retard` | `nominal`, `relance-envoi`, `relance-envoyee`, `aucun-retard` |
| **MgContrats** | `/asso/contrats` | Contrats | `nominal`, `detail-ouvert`, `aucun-contrat` | `nominal`, `detail-ouvert`, `aucun-contrat` |
| **MgEquipe** | `/asso/equipe` | Comptes gestionnaires | `nominal`, `modale-invitation`, `quota-atteint` | `nominal`, `invitation`, `quota-atteint` |
| **MgAbonnement** | `/asso/abonnement` | Abonnement | `actif`, `echeance-proche`, `suspendu` | `actif`, `echeance-proche`, `suspendu` |
| **MgParametres** | `/asso/parametres` | Paramètres de l’association | `nominal`, `modifications-non-enregistrees`, `enregistre` | `nominal`, `modifications-non-enregistrees`, `enregistre` |
| **MgNotifications** | `/asso/notifications` | Notifications gestionnaire | `nominal`, `tout-lu`, `vide` | `nominal`, `tout-lu`, `vide` |
| **MgProfil** | `/asso/profil` | Profil gestionnaire | `nominal`, `changement-mot-de-passe`, `mot-de-passe-modifie` | `nominal`, `changement-mot-de-passe`, `mot-de-passe-modifie` |
| **MgPlus** | `/asso/plus (mobile uniquement)` | Menu « Plus » de la navigation basse mobile | — | `défaut` |

## Espace super-admin

Thème : `superadmin` (indigo)

| Écran | Route | Description | États web | États mobile |
|---|---|---|---|---|
| **SaDashboard** | `/plateforme` | Tableau de bord plateforme | `nominal`, `aucune-demande` | — |
| **SaDemandes** | `/plateforme/demandes` | Liste des demandes | `nominal`, `vide`, `recherche-sans-resultat` | — |
| **SaDemande** | `/plateforme/demandes/[id]` | Traitement d’une demande | `a-traiter`, `approuvee`, `refusee`, `modale-approbation`, `modale-refus` | — |
| **SaAssociations** | `/plateforme/associations` | Liste des associations | `nominal`, `filtres-actifs`, `vide` | — |
| **SaAssociation** | `/plateforme/associations/[id]` | Détail d’une association | `association-entraide-yopougon`, `association-ressortissants-man`, `association-jeunesse-bouake`, `etat-suspendue` | — |
| **SaNouvelleAssociation** | `/plateforme/associations/nouvelle` | Création directe d’association | `rempli`, `vide`, `erreurs`, `envoi-en-cours` | — |
| **SaPlans** | `/plateforme/plans` | Plans d’abonnement | `nominal`, `aucun-plan` | — |
| **SaPlan** | `/plateforme/plans/[id]` | Édition / création d’un plan | `modification`, `creation`, `avertissement-abonnes` | — |
| **SaFacturation** | `/plateforme/facturation` | Facturation globale (V2 : « Bientôt disponible ») | `nominal`, `bientot-disponible` | — |
| **SaUtilisateurs** | `/plateforme/utilisateurs` | Utilisateurs plateforme (V2) | `nominal`, `bientot-disponible` | — |
| **SaProfil** | `/plateforme/profil` | Profil super-admin | `défaut` | — |

## Composants partagés (captures dans `screens/composants-partages/web/`)

| Composant | Rôle |
|---|---|
| **PublicHeader** | En-tête public |
| **PublicFooter** | Pied de page public |
| **SaSidebar** | Barre latérale super-admin |
| **SaTopbar** | Barre supérieure super-admin |
| **MgSidebar** | Barre latérale gestionnaire |
| **MgTopbar** | Barre supérieure gestionnaire |
| **MgProjetHeader** | En-tête + onglets du détail projet |
| **MgMobNav** | Navigation basse mobile gestionnaire (5 entrées) |
| **MbNav** | Navigation basse souscripteur (4 entrées + bouton flottant) |

Total : 323 captures.
