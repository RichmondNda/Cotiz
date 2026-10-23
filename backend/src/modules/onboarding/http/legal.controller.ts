import { Controller, Get, Param } from '@nestjs/common';
import { Can, Endpoint } from '../../../shared/http/index.js';
import { WithoutTenantContext } from '../../../shared/tenant-context/index.js';
import { GetLegalPageUseCase } from '../application/get-legal-page.use-case.js';

/** pub.legal : pages légales du site public, sans authentification ni accès à la base. */
@Controller('public/legal')
export class LegalController {
  constructor(private readonly getPage: GetLegalPageUseCase) {}

  @Get(':slug')
  @Endpoint('pub.legal', 'get')
  @Can('public')
  @WithoutTenantContext()
  get(@Param('slug') slug: string) {
    return this.getPage.execute(slug);
  }
}
