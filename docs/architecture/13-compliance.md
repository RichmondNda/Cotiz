# 13 · Données personnelles et conformité

> Ce document n'est pas un avis juridique. Les points ci-dessous sont à faire valider par un juriste dans chaque pays de commercialisation.

## Cadre probable
- Côte d'Ivoire : loi n° 2013-450 (données personnelles, contrôle de l'ARTCI, formalités préalables) ; loi n° 2013-546 (transactions électroniques, valeur de la signature électronique).
- Autres pays : loi et autorité propres (ex. CDP au Sénégal).
- Souscripteurs résidant dans l'UE : le RGPD peut s'appliquer.
- Localisation des données : le pays d'hébergement est une décision juridique autant que technique (décision ouverte n° 5).

## Rôles
| Données | Rôle de Cotiz | Conséquence |
|---|---|---|
| Souscripteurs, cotisations, paiements, contrats d'une association | Sous-traitant | Contrat de sous-traitance annexé au contrat association–plateforme |
| Comptes des associations, facturation, journaux techniques | Responsable de traitement | Politique de confidentialité, registre des traitements |

## Ce que l'architecture apporte
| Principe | Mise en œuvre |
|---|---|
| Minimisation | Aucune pièce d'identité ; EXIF supprimé ; téléphone masqué dans les journaux ; **aucune donnée transmise à un fournisseur tiers** (SMS, email, captcha, polices) avant le groupe 6 |
| Sécurité | Doc 02 ; audit en ajout seul |
| Accès | Export JSON de ses données depuis le profil (lot 4.7) |
| Effacement | Anonymisation de l'identité, écritures financières conservées |
| Transparence | Onboarding souscripteur : qui l'a inscrit et pourquoi |

## Conservation (proposition, décision ouverte n° 8)
| Donnée | Durée | Mécanisme |
|---|---|---|
| Écritures financières | Vie de l'association + 10 ans (ordre de grandeur OHADA) | Jamais supprimées, anonymisables |
| Contrats signés, factures | 10 ans | Compartiment WORM |
| Preuves de paiement | 5 ans après clôture du projet | Cycle de vie MinIO |
| Journal d'audit | 5 ans | Partitions archivées |
| Journaux techniques | 30 jours consultables, 1 an archivés | ILM Elasticsearch |
| Sessions, codes, exports | 30 jours, 72 h après expiration, 7 jours | Tâche `housekeeping` |
| Demandes de création refusées | 1 an | `housekeeping` |

## Paiement en ligne (groupe 6.3, option)
Dans l'UEMOA, détenir ou faire transiter des fonds pour autrui est une activité réglementée (BCEAO). Règle : **Cotiz ne détient jamais l'argent** ; le prestataire agréé verse directement à l'association. Avis juridique obligatoire avant le lot 6.3.
