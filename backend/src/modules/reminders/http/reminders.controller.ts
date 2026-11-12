import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { AssociationIdParams, AssociationParams, ENDPOINTS } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { ListReminderHistoryUseCase } from '../application/list-reminder-history.use-case.js';
import { ListReminderQueueUseCase } from '../application/list-reminder-queue.use-case.js';
import { MarkReminderUseCase } from '../application/mark-reminder.use-case.js';
import { SendRemindersUseCase } from '../application/send-reminders.use-case.js';

const SendBody = ENDPOINTS['rm.send'].operations.send.request.body;
const QueueQuery = ENDPOINTS['rm.queue'].operations.list.request.query;
const HandledBody = ENDPOINTS['rm.queue'].operations.handled.request.body;
const HistoryQuery = ENDPOINTS['rm.hist'].operations.list.request.query;

/** Relances (rm.send, rm.queue, rm.hist ; lot 4.3) : envoi manuel, file « À relancer », historique. */
@Controller('associations/:aid/reminders')
export class RemindersController {
  constructor(
    private readonly sendReminders: SendRemindersUseCase,
    private readonly listQueue: ListReminderQueueUseCase,
    private readonly markReminder: MarkReminderUseCase,
    private readonly listHistory: ListReminderHistoryUseCase,
  ) {}

  @Post()
  @Endpoint('rm.send', 'send')
  @Can('reminders.send')
  @HttpCode(202)
  send(@Param() params: unknown, @Body() body: unknown) {
    return this.sendReminders.execute(parseInput(AssociationParams, params).aid, parseInput(SendBody, body));
  }

  @Get('queue')
  @Endpoint('rm.queue', 'list')
  @Can('reminders.send')
  queue(@Param() params: unknown, @Query() query: unknown) {
    return this.listQueue.execute(parseInput(AssociationParams, params).aid, parseInput(QueueQuery, query));
  }

  @Post('queue/:id/handled')
  @Endpoint('rm.queue', 'handled')
  @Can('reminders.send')
  @HttpCode(200)
  handled(@Param() params: unknown, @Body() body: unknown) {
    const { aid, id } = parseInput(AssociationIdParams, params);
    return this.markReminder.execute(aid, id, parseInput(HandledBody, body).outcome);
  }

  @Get('history')
  @Endpoint('rm.hist', 'list')
  @Can('association.read')
  history(@Param() params: unknown, @Query() query: unknown) {
    return this.listHistory.execute(parseInput(AssociationParams, params).aid, parseInput(HistoryQuery, query));
  }
}
