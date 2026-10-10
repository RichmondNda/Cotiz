import type { DB_ENUMS } from '@cotiz/contracts';
import type { Space } from '../../../shared/tenant-context/index.js';

type FilePurpose = (typeof DB_ENUMS)['files_purpose'][number];

/**
 * Espace d'où chaque usage se dépose (docs/specs/screens.yaml : écrans de fl.upload). La preuve de paiement est
 * déposée par le souscripteur (mb-declarer) ; logo, couverture, imports et relevés par un gestionnaire.
 * Contrats, factures et exports sont produits par le serveur : refusés avant (uploadRejection).
 */
export const UPLOAD_SPACE: Readonly<Partial<Record<FilePurpose, Space>>> = {
  payment_proof: 'subscriber',
  logo: 'association',
  cover: 'association',
  import_source: 'association',
  bank_statement: 'association',
};
