import { messageTemplates as t } from '@cotiz/db';
import { and, eq, inArray } from 'drizzle-orm';
import { currentTx } from '../../../shared/tenant-context/index.js';

/** Langue des messages (V1 : une seule), comme les modèles des notifications. */
const LOCALE = 'fr-CI';

/**
 * Message d'une règle de relance (lot 4.3), gardé comme modèle de l'association dans message_templates (canal
 * `manual` : message prêt, jamais lu par les modèles des notifications, qui ne lisent que `in_app` et `push`). Un
 * changement de texte ajoute une version, la précédente reste (historique) ; renvoie l'id du modèle à citer. Contexte de
 * l'association (RLS : tenant_templates).
 */
export async function saveRuleTemplate(input: {
  associationId: string;
  key: string;
  body: string;
  previousId?: string | null;
}): Promise<string> {
  const tx = currentTx();
  let version = 1;
  if (input.previousId) {
    const [previous] = await tx
      .select({ body: t.body, version: t.version })
      .from(t)
      .where(and(eq(t.id, input.previousId), eq(t.associationId, input.associationId)));
    if (previous?.body === input.body) return input.previousId;
    if (previous) version = previous.version + 1;
  }
  const [row] = await tx
    .insert(t)
    .values({
      associationId: input.associationId,
      key: input.key,
      channel: 'manual',
      locale: LOCALE,
      subject: '',
      body: input.body,
      version,
    })
    .returning({ id: t.id });
  if (!row) throw new Error('modèle de message non créé');
  return row.id;
}

/** Textes des modèles d'une association, par id (contexte de l'association). */
export async function ruleTemplateBodiesOf(
  associationId: string,
  ids: readonly string[],
): Promise<Map<string, string>> {
  if (ids.length === 0) return new Map();
  const rows = await currentTx()
    .select({ id: t.id, body: t.body })
    .from(t)
    .where(and(inArray(t.id, [...ids]), eq(t.associationId, associationId)));
  return new Map(rows.map((r) => [r.id, r.body]));
}
