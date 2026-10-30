// Surface publique du module files : fichiers rattachables par une association (logo, lot 2.1 ; couverture d'un
// projet et son nom, lot 2.2). Les modules qui référencent la preuve d'un paiement (lot 3.3) exigeront ici un fichier
// `clean` de l'acteur. Preuves des paiements de référence de seed-dev (lot 2.4).
export { fileNamesOf, isUsableAssociationFile } from './application/usable-file.js';
export { seedDevProof } from './application/seed-dev-proof.js';
