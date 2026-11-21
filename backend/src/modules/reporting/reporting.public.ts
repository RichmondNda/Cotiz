// Surface du module reporting pour les autres modules et les scripts (architecture/01). Lecture seule.
export { RefreshPlatformStatsUseCase } from './application/refresh-platform-stats.use-case.js';
export { ProjectFigures } from './application/project-figures.js';
export { ProjectFiguresModule } from './project-figures.module.js';
// Exports (lot 4.6) : ce qu'en dit la notification du demandeur.
export { exportNoticeOf } from './application/export-records.js';
// CSV (« ; », BOM, formules neutralisées) : export du journal d'audit (lot 4.7).
export { csvDocument } from './domain/export-csv.js';
