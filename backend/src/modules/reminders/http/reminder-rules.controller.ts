import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { AssociationIdParams, AssociationParams, ENDPOINTS } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { CreateReminderRuleUseCase } from '../application/create-reminder-rule.use-case.js';
import { ListReminderRulesUseCase } from '../application/list-reminder-rules.use-case.js';
import { UpdateReminderRuleUseCase } from '../application/update-reminder-rule.use-case.js';

const CreateBody = ENDPOINTS['rm.rules'].operations.create.request.body;
const PatchBody = ENDPOINTS['rm.rules'].operations.patch.request.body;

/** Règles de relance automatique (rm.rules, lot 4.3), `reminders.send`. */
@Controller('associations/:aid/reminder-rules')
export class ReminderRulesController {
  constructor(
    private readonly listRules: ListReminderRulesUseCase,
    private readonly createRule: CreateReminderRuleUseCase,
    private readonly updateRule: UpdateReminderRuleUseCase,
  ) {}

  @Get()
  @Endpoint('rm.rules', 'list')
  @Can('reminders.send')
  list(@Param() params: unknown) {
    return this.listRules.execute(parseInput(AssociationParams, params).aid);
  }

  @Post()
  @Endpoint('rm.rules', 'create')
  @Can('reminders.send')
  @HttpCode(201)
  create(@Param() params: unknown, @Body() body: unknown) {
    return this.createRule.execute(parseInput(AssociationParams, params).aid, parseInput(CreateBody, body));
  }

  @Patch(':id')
  @Endpoint('rm.rules', 'patch')
  @Can('reminders.send')
  patch(@Param() params: unknown, @Body() body: unknown) {
    const { aid, id } = parseInput(AssociationIdParams, params);
    return this.updateRule.execute(aid, id, parseInput(PatchBody, body));
  }
}
