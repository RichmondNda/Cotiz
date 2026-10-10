import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from './scheduled-tasks.js';

type Purge = (now: Date) => Promise<void>;

/**
 * Tâche `housekeeping` (jobs.yaml : quotidienne 03:00) : chaque module y inscrit ses purges (fichiers orphelins au
 * lot 0.5 ; sessions, codes, exports, demandes refusées aux lots suivants). Une purge en échec n'empêche pas les
 * autres ; la tâche échoue ensuite pour être reprise (les purges sont idempotentes).
 */
@Injectable()
export class Housekeeping implements OnModuleInit {
  private readonly logger = new Logger(Housekeeping.name);
  private readonly purges = new Map<string, Purge>();

  constructor(private readonly scheduled: ScheduledTasks) {}

  onModuleInit(): void {
    this.scheduled.define({ name: 'housekeeping', pattern: '0 3 * * *', run: () => this.run(new Date()) });
  }

  /** Inscrit une purge ; renvoie de quoi la retirer. */
  register(name: string, purge: Purge): () => void {
    if (this.purges.has(name)) throw new Error(`purge déjà inscrite : ${name}`);
    this.purges.set(name, purge);
    return () => this.purges.delete(name);
  }

  async run(now: Date): Promise<void> {
    const failures: unknown[] = [];
    for (const [name, purge] of this.purges) {
      try {
        await purge(now);
      } catch (error) {
        this.logger.error({ msg: 'purge en échec', purge: name, err: error });
        failures.push(error);
      }
    }
    if (failures.length > 0) throw new AggregateError(failures, `${String(failures.length)} purge(s) en échec`);
  }
}
