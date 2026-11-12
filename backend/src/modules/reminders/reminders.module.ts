import { Module } from '@nestjs/common';
import { CreateReminderRuleUseCase } from './application/create-reminder-rule.use-case.js';
import { ListReminderRulesUseCase } from './application/list-reminder-rules.use-case.js';
import { UpdateReminderRuleUseCase } from './application/update-reminder-rule.use-case.js';
import { ReminderRulesController } from './http/reminder-rules.controller.js';

/**
 * Module reminders (endpoints.yaml : rm.* ; lot 4.3), partie api : règles de relance, file « À relancer », relance
 * manuelle, historique. Évaluation quotidienne des règles (reminders.evaluate) : RemindersWorkerModule.
 */
@Module({
  controllers: [ReminderRulesController],
  providers: [ListReminderRulesUseCase, CreateReminderRuleUseCase, UpdateReminderRuleUseCase],
})
export class RemindersModule {}
