import { Controller, Get, Header } from '@nestjs/common';
import { Can, Endpoint } from '../../../shared/http/index.js';
import { ExportMyDataUseCase } from '../application/export-my-data.use-case.js';

/** me.profile › export (lot 4.7) : export JSON de ses données, depuis l'écran de profil de chaque espace. */
@Controller('me/export')
export class MeExportController {
  constructor(private readonly exportData: ExportMyDataUseCase) {}

  /** Propre à la personne : jamais mis en cache. */
  @Get()
  @Endpoint('me.profile', 'export')
  @Can('authenticated')
  @Header('Cache-Control', 'no-store')
  get() {
    return this.exportData.execute();
  }
}
