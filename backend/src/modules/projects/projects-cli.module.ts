import { Module } from '@nestjs/common';
import { SeedDevProjectsUseCase } from './application/seed-dev-projects.use-case.js';

/** Scripts d'exploitation du module projects (src/cli.ts) : projets de développement. */
@Module({ providers: [SeedDevProjectsUseCase], exports: [SeedDevProjectsUseCase] })
export class ProjectsCliModule {}
