// Surface du module reminders (relances, lot 4.3) pour les autres modules et les points d'entrée (architecture/01).
export { RemindersModule } from './reminders.module.js';
export { RemindersWorkerModule } from './reminders-worker.module.js';
// Notifications : rappel au souscripteur annoncé par `reminder.sent`.
export { type ReminderNotice, reminderNoticesOf } from './application/reminder-notice.js';
