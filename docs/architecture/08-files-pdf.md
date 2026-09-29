# 08 · Fichiers et PDF

## Compartiments MinIO
| Compartiment | Contenu | Règles |
|---|---|---|
| cotiz-proofs | Preuves de paiement | Privé, versionné, antivirus, EXIF supprimé |
| cotiz-legal | Contrats signés, factures | Privé, verrouillage d'objet en mode conformité (WORM) |
| cotiz-exports | Exports | Privé, expiration 7 jours |
| cotiz-imports | Fichiers importés, relevés | Privé, expiration 30 jours |
| cotiz-media | Logos, couvertures | Privé, servis par URL signée longue ou proxy avec cache |

Clé d'objet : `{association_id}/{purpose}/{uuid}.{ext}` — jamais le nom d'origine.

## Dépôt
1. `POST /uploads` `{ purpose, mimeType, sizeBytes }` → vérifie limites (5 Mo ; JPG, PNG, PDF ; CSV/XLSX pour imports et relevés), crée `files` (pending), renvoie une URL de dépôt présignée (5 min, taille et type imposés), préfixe `quarantine/`.
2. Le navigateur dépose directement dans MinIO.
3. `POST /uploads/{id}/complete` → file `files` du worker : octets magiques, ClamAV (`clamd` en TCP), suppression EXIF (sharp), SHA-256, miniature, déplacement vers la clé définitive, `scan_status = clean | infected`.
4. Le front attend `clean` (interrogation courte ou SSE), en pratique < 2 s. Un paiement ne peut référencer qu'un fichier `clean`.

## Téléchargement
`GET /files/{id}` : RLS + permission, trace d'audit pour les documents juridiques, **302** vers une URL signée de 5 min. Aucune URL publique permanente.

## PDF
Gabarits HTML dans `packages/pdf-templates` (polices Poppins et Inter embarquées depuis `@fontsource`, couleurs de la charte), rendus par Gotenberg (Chromium) dans la file `documents` (concurrence 2).
| Document | Déclencheur | Lot |
|---|---|---|
| Fiche d'activation imprimable (A6, QR) | Rendu **côté navigateur**, pas de PDF serveur | 2.3 |
| Contrat signé + page de preuve | `contract.signed` | 4.1 |
| Facture d'abonnement | `subscription.invoice_issued` | 4.6 |
| Rapport de projet | Export demandé | 4.6 |
| Reçu de paiement (optionnel) | `payment.validated` | 4.6 |

Tout PDF est haché, stocké, référencé dans `files`. Un contrat signé n'est jamais régénéré.
