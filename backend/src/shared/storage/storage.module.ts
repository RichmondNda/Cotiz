import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service.js';

/** Stockage des fichiers (MinIO), partagé par l'api et le worker. */
@Global()
@Module({ providers: [StorageService], exports: [StorageService] })
export class StorageModule {}
