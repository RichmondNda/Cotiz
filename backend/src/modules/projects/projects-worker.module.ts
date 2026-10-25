import { Module, type OnModuleInit } from '@nestjs/common';
import { ScheduledTasks } from '../../shared/scheduler/index.js';
import { ActivateProjectsUseCase } from './application/activate-projects.use-case.js';

/** Partie worker du module projects : tâche `projects.activate` (jobs.yaml : quotidienne 00:30). */
@Module({
  providers: [ActivateProjectsUseCase],
  exports: [ActivateProjectsUseCase],
})
export class ProjectsWorkerModule implements OnModuleInit {
  constructor(
    private readonly scheduled: ScheduledTasks,
    private readonly activateProjects: ActivateProjectsUseCase,
  ) {}

  onModuleInit(): void {
    this.scheduled.define({
      name: 'projects.activate',
      pattern: '30 0 * * *',
      run: () => this.activateProjects.execute(new Date()),
    });
  }
}
