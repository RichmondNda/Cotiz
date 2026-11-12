import { Injectable, Logger } from '@nestjs/common';
import { reminderRules } from '@cotiz/db';
import { isRemindersTime, reminderDueDate, todayIn } from '@cotiz/domain';
import { eq } from 'drizzle-orm';
import { planFeaturesOf } from '../../billing/billing.public.js';
import { remindableInstallmentsOf } from '../../ledger/ledger.public.js';
import { remindableAssociationTimezonesOf } from '../../tenancy/tenancy.public.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { REDIS_PREFIX } from '../../../shared/queues/index.js';
import { RedisClient } from '../../../shared/redis/redis.module.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';
import { rulesWithMessagesOf } from './reminder-rule-records.js';
import { createReminderRuns } from './reminder-runs.js';

/** Durée d'une marque « journée faite » : couvre la journée locale de tout fuseau, puis disparaît seule. */
const DONE_TTL_SECONDS = 48 * 3600;

/** Marque d'une association traitée pour un jour local donné. */
export const remindersDoneKeyOf = (associationId: string, day: string) =>
  `${REDIS_PREFIX}:jobs:reminders.evaluate:${associationId}:${day}`;

/**
 * Tâche `reminders.evaluate` (jobs.yaml, lot 4.3 ; architecture/04 § 4.9) : lancée toutes les heures, elle liste en
 * espace system les associations qui ont une règle active, ni suspendues ni fermées, où il est 08:30 ou plus tard et
 * dont la journée n'est pas faite (marque Redis), puis traite chacune dans son contexte (RLS). Plan sans la
 * fonctionnalité `auto_reminders` : rien. Pour chaque règle active, les échéances du jour visé (reminderDueDate), du
 * projet de la règle ou de tous, encore dues (remindableInstallmentsOf : ni soldées, ni dispensées, ni annulées) →
 * une relance chacune (rappel au souscripteur ; en retard, entrée « À relancer » avec le message prêt). Marque perdue :
 * la journée est rejouée, l'unicité (règle, échéance, jour) empêche tout second rappel.
 */
@Injectable()
export class EvaluateRemindersUseCase {
  private readonly logger = new Logger(EvaluateRemindersUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly outbox: OutboxService,
    private readonly redis: RedisClient,
  ) {}

  async execute(now: Date): Promise<void> {
    const due = await this.db.withTenantContext({ space: 'system' }, async () => {
      const rows = await currentTx()
        .selectDistinct({ associationId: reminderRules.associationId })
        .from(reminderRules)
        .where(eq(reminderRules.isActive, true));
      const timezones = await remindableAssociationTimezonesOf(rows.map((r) => r.associationId));
      return rows
        .map((r) => ({ id: r.associationId, timezone: timezones.get(r.associationId) }))
        .filter((a): a is { id: string; timezone: string } => !!a.timezone && isRemindersTime(a.timezone, now))
        .sort((a, b) => a.id.localeCompare(b.id));
    });
    let created = 0;
    const failures: unknown[] = [];
    // Une association en échec n'empêche pas les autres ; la tâche échoue ensuite pour être reprise.
    for (const association of due) {
      const today = todayIn(association.timezone, now);
      const doneKey = remindersDoneKeyOf(association.id, today);
      if (await this.isDone(doneKey)) continue;
      try {
        created += await this.db.withTenantContext({ space: 'association', associationId: association.id }, () =>
          this.evaluate(association.id, today),
        );
        // Après le COMMIT : une marque posée avant pourrait survivre à une transaction annulée et perdre la journée.
        await this.markDone(doneKey);
      } catch (error) {
        this.logger.error({ msg: 'relances non évaluées', associationId: association.id, err: error });
        failures.push(error);
      }
    }
    if (created > 0) this.logger.log({ msg: 'relances créées', count: created });
    if (failures.length > 0) {
      throw new AggregateError(failures, `reminders.evaluate : ${String(failures.length)} association(s) en échec`);
    }
  }

  /** Relances du jour d'une association, dans son contexte ; renvoie le nombre de relances nouvelles. */
  async evaluate(associationId: string, today: string): Promise<number> {
    if (!(await planFeaturesOf(associationId)).includes('auto_reminders')) return 0;
    let created = 0;
    for (const { row, message } of await rulesWithMessagesOf(associationId)) {
      if (!row.isActive) continue;
      const installments = await remindableInstallmentsOf(associationId, {
        dueDate: reminderDueDate(row.trigger, row.offsetDays, today),
        projectId: row.projectId,
      });
      const runs = await createReminderRuns(this.outbox, {
        associationId,
        today,
        source: { kind: 'automatic', ruleId: row.id, message, channels: row.channels },
        installments,
      });
      created += runs.length;
    }
    return created;
  }

  /** Redis illisible : la journée est retraitée, sans doublon (unicité règle, échéance, jour). */
  private async isDone(key: string): Promise<boolean> {
    try {
      return (await this.redis.redis.exists(key)) === 1;
    } catch (error) {
      this.logger.warn({ msg: 'marque des relances illisible', err: (error as Error).name });
      return false;
    }
  }

  private async markDone(key: string): Promise<void> {
    try {
      await this.redis.redis.set(key, '1', 'EX', DONE_TTL_SECONDS);
    } catch (error) {
      this.logger.warn({ msg: 'marque des relances non posée', err: (error as Error).name });
    }
  }
}
