// Surface du module notifications (cloche, canaux, routeur) pour les autres modules et les points d'entrée
// (architecture/01). Lot 2.5.
export { NotificationsWorkerModule } from './notifications-worker.module.js';
export { NotificationsModule } from './notifications.module.js';
// Relances (lot 4.3) : message des règles gardé en modèle, rendu des variables `{{…}}`.
export { saveManualTemplate, templateBodiesOf } from './infra/message-templates.js';
export { renderTemplate } from './domain/templates.js';
