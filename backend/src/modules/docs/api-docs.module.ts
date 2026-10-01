import { Module } from '@nestjs/common';
import { ApiDocsController } from './api-docs.controller.js';

/** Enregistré par AppModule hors production seulement. */
@Module({ controllers: [ApiDocsController] })
export class ApiDocsModule {}
