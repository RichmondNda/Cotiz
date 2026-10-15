import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { ExpireCodesUseCase } from './application/expire-codes.use-case.js';

/** Partie worker du module identity : tâche `codes.expire` (jobs.yaml : horaire). */
@Module({ providers: [ExpireCodesUseCase], exports: [ExpireCodesUseCase] })
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
