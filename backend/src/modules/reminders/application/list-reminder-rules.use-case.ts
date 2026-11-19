import { Injectable } from '@nestjs/common';
import type { ReminderRule } from '@cotiz/contracts';
import type { z } from 'zod';
import { contextAssociationId } from '../../members/members.public.js';
import { rulesWithMessagesOf, toReminderRule } from './reminder-rule-records.js';

/**
 * rm.rules › list : règles de relance de l'association, avec leur message. Lecture ouverte même sans la fonctionnalité
 * `auto_reminders` (le front affiche « Bientôt disponible ») ; seules les écritures l'exigent.
 */
@Injectable()
export class ListReminderRulesUseCase {
  async execute(aid: string): Promise<{ items: z.infer<typeof ReminderRule>[] }> {
    const associationId = contextAssociationId(aid);
    const rules = await rulesWithMessagesOf(associationId);
    return { items: rules.map(({ row, message }) => toReminderRule(row, message)) };
  }
}
