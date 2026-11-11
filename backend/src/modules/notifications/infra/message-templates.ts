import { messageTemplates as t } from '@cotiz/db';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type { RenderedMessage } from '../domain/channel.js';
import { renderTemplate } from '../domain/templates.js';

/** Langue des messages (V1 : une seule). */
export const TEMPLATE_LOCALE = 'fr-CI';
const CHANNELS = ['in_app', 'push'] as const;

/**
 * Modèles de messages (message_templates, lot 4.2) appliqués aux messages d'un événement : pour chaque type et canal,
 * la dernière version du modèle de l'association, sinon celle de la plateforme, sinon le texte du code. Lu dans le
 * contexte courant, donc sous la RLS : en contexte association, ses modèles et ceux de la plateforme (jamais ceux d'une
 * autre association) ; ailleurs, ceux de la plateforme seulement. Un modèle qui cite une variable absente du message
 * est ignoré (texte du code). Renvoie de nouveaux messages, avec `variants` par canal.
 */
export async function applyMessageTemplates(
  messages: readonly RenderedMessage[],
  associationId: string | null,
): Promise<RenderedMessage[]> {
  const types = [...new Set(messages.map((m) => m.type))];
  if (types.length === 0) return [...messages];
  const rows = await currentTx()
    .select({
      key: t.key,
      channel: t.channel,
      associationId: t.associationId,
      subject: t.subject,
      body: t.body,
    })
    .from(t)
    .where(
      and(
        inArray(t.key, types),
        inArray(t.channel, [...CHANNELS]),
        eq(t.locale, TEMPLATE_LOCALE),
        associationId ? or(eq(t.associationId, associationId), isNull(t.associationId)) : isNull(t.associationId),
      ),
    )
    // Association d'abord, puis la version la plus récente : la première ligne de chaque (type, canal) l'emporte.
    .orderBy(sql`${t.associationId} IS NULL`, desc(t.version), desc(t.createdAt));
  const chosen = new Map<string, { subject: string; body: string }>();
  for (const row of rows) {
    const key = `${row.key}:${row.channel}`;
    if (!chosen.has(key)) chosen.set(key, row);
  }
  if (chosen.size === 0) return [...messages];
  return messages.map((msg) => {
    const variants: NonNullable<RenderedMessage['variants']> = { ...msg.variants };
    for (const channel of CHANNELS) {
      const template = chosen.get(`${msg.type}:${channel}`);
      if (!template) continue;
      const vars = msg.vars ?? {};
      const title = renderTemplate(template.subject, vars);
      const body = renderTemplate(template.body, vars);
      if (title !== null && body !== null) variants[channel] = { title, body };
    }
    return Object.keys(variants).length > 0 ? { ...msg, variants } : msg;
  });
}
