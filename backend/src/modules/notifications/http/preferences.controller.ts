import { Body, Controller, Get, Header, Put } from '@nestjs/common';
import { ENDPOINTS } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import {
  GetNotificationPreferencesUseCase,
  ReplaceNotificationPreferencesUseCase,
} from '../application/notification-preferences.use-case.js';

const ReplaceBody = ENDPOINTS['me.prefs'].operations.replace.request.body;

/** me.prefs (lot 4.2) — permission `authenticated` : réglages de notification par type et canal de la personne. */
@Controller('me/notification-preferences')
export class PreferencesController {
  constructor(
    private readonly getPreferences: GetNotificationPreferencesUseCase,
    private readonly replacePreferences: ReplaceNotificationPreferencesUseCase,
  ) {}

  @Get()
  @Endpoint('me.prefs', 'get')
  @Can('authenticated')
  @Header('Cache-Control', 'no-store')
  index() {
    return this.getPreferences.execute();
  }

  @Put()
  @Endpoint('me.prefs', 'replace')
  @Can('authenticated')
  replace(@Body() body: unknown) {
    return this.replacePreferences.execute(parseInput(ReplaceBody, body));
  }
}
