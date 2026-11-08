import { files } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { UPLOAD_SPACE } from '../domain/upload-policy.js';

/** Usages lisibles hors espace association : ceux qu'on y dépose, et le PDF de son contrat signé (lot 4.1). */
function readableOutsideAssociation(purpose: (typeof files.$inferSelect)['purpose'], space: Actor['space']): boolean {
  return UPLOAD_SPACE[purpose] === space || (purpose === 'contract_pdf' && space === 'subscriber');
}

/**
 * Fichier lisible par l'acteur, sous RLS (association, ou déposant en espace souscripteur), revérifié ici : en espace
 * association, seulement ceux de cette association ; ailleurs, seulement les usages déposés depuis cet espace
 * (`null` → 404).
 */
export async function findFile(actor: Actor, id: string, options: { lock?: 'skip-locked' } = {}) {
  const query = currentTx().select().from(files).where(eq(files.id, id));
  // SKIP LOCKED : une ligne verrouillée (analyse en cours) est absente du résultat, sans attente.
  const [row] = await (options.lock === 'skip-locked' ? query.for('update', { skipLocked: true }) : query);
  if (!row) return null;
  if (actor.space === 'association' && row.associationId !== actor.associationId) return null;
  // Hors de l'espace association, seulement les usages déposés depuis cet espace (la preuve du souscripteur) : en
  // complément de la RLS (owner_access limité à l'espace souscripteur).
  if (actor.space !== 'association' && !readableOutsideAssociation(row.purpose, actor.space)) return null;
  // Espace souscripteur : seulement ses propres fichiers (en complément de la RLS).
  if (actor.space === 'subscriber' && row.ownerUserId !== actor.userId) return null;
  return row;
}
