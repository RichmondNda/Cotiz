import { files } from '@cotiz/db';
import { and, eq, isNull } from 'drizzle-orm';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';

/** Preuve de paiement déposée par la personne connectée, telle que la déclaration la contrôle (lot 3.3). */
export interface SubscriberProof {
  /** `null` tant qu'aucune déclaration ne l'a rattachée à une association. */
  associationId: string | null;
  scanStatus: 'pending' | 'clean' | 'infected';
}

/**
 * Preuve `id` de la personne connectée (espace subscriber, RLS `owner_access`, revérifié ici : déposant et usage) ;
 * autre fichier, d'autrui ou inconnu : `null`. Ligne verrouillée jusqu'à la fin de la transaction : deux déclarations
 * simultanées citant la même preuve se suivent, la seconde voit le paiement de la première (lot 3.3).
 */
export async function subscriberProofOf(id: string): Promise<SubscriberProof | null> {
  const context = currentContext();
  if (context?.space !== 'subscriber' || !context.userId) {
    throw new Error('subscriberProofOf : espace souscripteur seulement');
  }
  const [row] = await currentTx()
    .select({
      ownerUserId: files.ownerUserId,
      purpose: files.purpose,
      associationId: files.associationId,
      scanStatus: files.scanStatus,
    })
    .from(files)
    .where(eq(files.id, id))
    .for('update');
  if (row?.ownerUserId !== context.userId || row.purpose !== 'payment_proof') return null;
  return { associationId: row.associationId, scanStatus: row.scanStatus };
}

/**
 * Rattache la preuve déclarée à l'association du paiement (espace system, worker) : le souscripteur ne la rattache
 * jamais lui-même (schema.sql, `owner_access`), le gestionnaire la lit ensuite par `tenant_isolation`. Seulement une
 * preuve de ce déposant encore sans association ; rejoué ou déjà rattachée : sans effet. Renvoie `true` si rattachée.
 */
export async function attachProofToAssociation(proof: {
  fileId: string;
  ownerUserId: string;
  associationId: string;
}): Promise<boolean> {
  if (currentContext()?.space !== 'system') throw new Error('attachProofToAssociation : espace system seulement');
  const rows = await currentTx()
    .update(files)
    .set({ associationId: proof.associationId })
    .where(
      and(
        eq(files.id, proof.fileId),
        eq(files.ownerUserId, proof.ownerUserId),
        eq(files.purpose, 'payment_proof'),
        isNull(files.associationId),
      ),
    )
    .returning({ id: files.id });
  return rows.length > 0;
}
