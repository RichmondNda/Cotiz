import { Global, Module } from '@nestjs/common';
import { Housekeeping } from './housekeeping.js';
import { ScheduledTasks } from './scheduled-tasks.js';

/** Tâches planifiées du worker (jamais dans l'api). */
@Global()
@Module({ providers: [ScheduledTasks, Housekeeping], exports: [ScheduledTasks, Housekeeping] })
export class SchedulerModule {}
