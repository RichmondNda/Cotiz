import { Module } from '@nestjs/common';
import { CONFIG, type Config } from '../../config.js';
import { ScanFileUseCase } from './application/scan-file.use-case.js';
import { VIRUS_SCANNER, type VirusScanner } from './domain/virus-scanner.js';
import { FileUploadedConsumer } from './events/file-uploaded.consumer.js';
import { FilesProcessor } from './events/files.processor.js';
import { ClamdScanner } from './infra/clamd-scanner.js';

/** Sans CLAMAV_URL (hors production) : toute analyse échoue, le fichier reste en attente. Jamais « sain » par défaut. */
const missingScanner: VirusScanner = {
  scan: () => Promise.reject(new Error('antivirus : CLAMAV_URL manquante')),
};

/** Partie worker du module files : analyse des fichiers déposés (architecture/08). */
@Module({
  providers: [
    {
      provide: VIRUS_SCANNER,
      inject: [CONFIG],
      useFactory: (config: Config): VirusScanner => {
        if (!config.CLAMAV_URL) return missingScanner;
        const url = new URL(config.CLAMAV_URL);
        return new ClamdScanner(url.hostname, Number(url.port || 3310));
      },
    },
    ScanFileUseCase,
    FileUploadedConsumer,
    FilesProcessor,
  ],
  exports: [ScanFileUseCase],
})
export class FilesWorkerModule {}
