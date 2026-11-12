import { Module } from '@nestjs/common';
import { CreateReminderRuleUseCase } from './application/create-reminder-rule.use-case.js';
import { ListReminderRulesUseCase } from './application/list-reminder-rules.use-case.js';
import { UpdateReminderRuleUseCase } from './application/update-reminder-rule.use-case.js';
import { ListReminderHistoryUseCase } from './application/list-reminder-history.use-case.js';
import { ListReminderQueueUseCase } from './application/list-reminder-queue.use-case.js';
import { MarkReminderUseCase } from './application/mark-reminder.use-case.js';
import { SendRemindersUseCase } from './application/send-reminders.use-case.js';
import { ReminderRulesController } from './http/reminder-rules.controller.js';
import { RemindersController } from './http/reminders.controller.js';

/**
 * Module reminders (endpoints.yaml : rm.* ; lot 4.3), partie api : règles de relance, file « À relancer », relance
 * manuelle, historique. Évaluation quotidienne des règles (reminders.evaluate) : RemindersWorkerModule.
 */
@Module({
  controllers: [ReminderRulesController, RemindersController],
  providers: [
    ListReminderRulesUseCase,
    CreateReminderRuleUseCase,
    UpdateReminderRuleUseCase,
    SendRemindersUseCase,
    ListReminderQueueUseCase,
    MarkReminderUseCase,
    ListReminderHistoryUseCase,
  ],
})
export class RemindersModule {}
