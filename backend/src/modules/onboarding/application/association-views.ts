import type { PlatformAssociationDetail } from '@cotiz/contracts';
import { platformPersonRefsOf } from '../../identity/identity.public.js';
import { platformAssociationDetail } from '../../tenancy/tenancy.public.js';

/**
 * Fiche plateforme d'une association qui vient d'être créée (réponse de pf.asso.create et de son rejeu) : la fiche de
 * pf.asso.get (tenancy), dont la frise se réduit à la création. L'entrée d'audit de la création n'est écrite qu'à la
 * fin du cas d'usage : la frise est posée ici, avec l'auteur de la création.
 */
export async function newAssociationDetail(id: string, createdBy: string): Promise<PlatformAssociationDetail> {
  const detail = await platformAssociationDetail(id);
  const creator = (await platformPersonRefsOf([createdBy])).get(createdBy) ?? null;
  return { ...detail, events: [{ type: 'association.created', at: detail.createdAt, by: creator, detail: null }] };
}
