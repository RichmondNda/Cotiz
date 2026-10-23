import { Module, type OnModuleInit } from '@nestjs/common';
import { RedisModule } from '../../shared/redis/redis.module.js';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { ExpireCodesUseCase } from './application/expire-codes.use-case.js';
import { SessionFamilies } from './application/session-families.js';
import { AssociationSuspendedConsumer } from './events/association-suspended.consumer.js';
import { RevokedSessions } from './infra/revoked-sessions.js';

/**
 * Partie worker du module identity : tâche `codes.expire` (jobs.yaml : horaire) ; sessions des gestionnaires d'une
 * association suspendue révoquées (association.suspended).
 */
@Module({
  imports: [RedisModule],
  providers: [ExpireCodesUseCase, SessionFamilies, RevokedSessions, AssociationSuspendedConsumer],
  exports: [ExpireCodesUseCase],
})
export class IdentityWorkerModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledTasks,
    private readonly expireCodes: ExpireCodesUseCase,
  ) {}

  onModuleInit(): void {
    this.scheduled.define({
      name: 'codes.expire',
      pattern: '0 * * * *',
      run: () => this.expireCodes.execute(new Date()),
    });
  }
}
