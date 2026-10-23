import { associations } from '@cotiz/db';
import { newId } from '@cotiz/domain';
import { eq, like, or, sql } from 'drizzle-orm';
import { DomainProblem } from '../../../shared/http/index.js';
import { currentContext, currentTx } from '../../../shared/tenant-context/index.js';
import { firstFreeSlug, slugFromName } from '../domain/slug.js';

export interface NewAssociation {
  name: string;
  type: string;
  city: string;
  country: string;
  registrationNumber: string | null;
  description: string | null;
  contactEmail: string;
  contactPhone: string;
  /** Slug choisi (création directe) : `slug_taken` s'il est pris ; absent : déduit du nom, suffixé si besoin. */
  slug?: string | undefined;
}

/**
 * Nouvelle association, en mise en place (`onboarding`), dans la transaction de l'appelant : approbation d'une demande,
 * création directe (lot 1.3). Espace plateforme seulement (connexion cotiz_platform).
 */
export async function createAssociation(input: NewAssociation): Promise<{ id: string; slug: string }> {
  if (currentContext()?.space !== 'platform') throw new Error('createAssociation : espace plateforme seulement');
  const tx = currentTx();
  const base = input.slug ?? slugFromName(input.name);
  // Deux créations simultanées du même nom : la seconde attend et prend le suffixe suivant.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${`associations:slug:${base}`}, 0))`);
  const rows = await tx
    .select({ slug: associations.slug })
    .from(associations)
    .where(or(eq(associations.slug, base), like(associations.slug, `${base}-%`)));
  const taken = new Set(rows.map((r) => r.slug));
  if (input.slug !== undefined && taken.has(input.slug)) throw new DomainProblem('slug_taken');

  const id = newId();
  const slug = firstFreeSlug(base, taken);
  await tx.insert(associations).values({
    id,
    slug,
    name: input.name,
    type: input.type,
    city: input.city,
    country: input.country,
    registrationNumber: input.registrationNumber,
    description: input.description,
    contactEmail: input.contactEmail,
    contactPhone: input.contactPhone,
    status: 'onboarding',
  });
  return { id, slug };
}
