import { files } from '@cotiz/db';
import { eq } from 'drizzle-orm';
import type { Actor } from '../../../shared/http/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import { UPLOAD_SPACE } from '../domain/upload-policy.js';

/**
 * Fichier lisible par l'acteur, sous RLS (association, ou déposant en espace souscripteur), revérifié ici : en espace
 * association, seulement ceux de cette association ; ailleurs, seulement les usages déposés depuis cet espace
 * (`null` → 404).
 */
export async function findFile(actor: Actor, id: string, options: { forUpdate?: boolean } = {}) {
  const query = currentTx().select().from(files).where(eq(files.id, id));
  const [row] = await (options.forUpdate ? query.for('update') : query);
  if (!row) return null;
  if (actor.space === 'association' && row.associationId !== actor.associationId) return null;
  // Hors de l'espace association, seulement les usages déposés depuis cet espace (la preuve du souscripteur) : en
  // complément de la RLS (owner_access limité à l'espace souscripteur).
  if (actor.space !== 'association' && UPLOAD_SPACE[row.purpose] !== actor.space) return null;
  return row;
}
