// Surface publique du module files : fichiers rattachables par une association (logo, lot 2.1 ; couverture d'un
// projet et son nom, lot 2.2). Preuve d'un paiement (lot 3.3) : celle du souscripteur connecté, son rattachement à
// l'association par le worker. Preuves des paiements de référence de seed-dev (lot 2.4).
export { fileNamesOf, isUsableAssociationFile } from './application/usable-file.js';
export { seedDevProof } from './application/seed-dev-proof.js';
// Fichier source d'un import (lot 4.4).
export { type ImportSource, importSourceOf } from './application/import-source.js';
export { attachProofToAssociation, type SubscriberProof, subscriberProofOf } from './application/payment-proof.js';
