import { z } from 'zod';
import { Uuid } from './scalars.js';

// Paramètres de chemin réutilisés (noms identiques aux `{…}` de endpoints.yaml).

export const IdParams = z.object({ id: Uuid });
export const AssociationParams = z.object({ aid: Uuid });
export const AssociationIdParams = AssociationParams.extend({ id: Uuid });
export const ProjectParams = AssociationParams.extend({ pid: Uuid });
export const MemberParams = AssociationParams.extend({ uid: Uuid });
