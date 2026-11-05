import { Module } from '@nestjs/common';
import { MembersModule } from '../members/members.public.js';
import { ProjectFigures } from './application/project-figures.js';

/**
 * Chiffres des projets (ProjectFigures) pour le module projects (pr.list, pr.get, pr.overview) : mêmes calculs que le
 * tableau de bord et le rapport, sans en importer les contrôleurs.
 */
@Module({
  imports: [MembersModule],
  providers: [ProjectFigures],
  exports: [ProjectFigures],
})
export class ProjectFiguresModule {}
