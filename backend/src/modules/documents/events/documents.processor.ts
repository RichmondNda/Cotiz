import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
  Optional,
} from '@nestjs/common';
import { DelayedError, type Job, Worker } from 'bullmq';
import { z } from 'zod';
import { CONFIG, type Config } from '../../../config.js';
import { runWithLogContext } from '../../../shared/logging/index.js';
import { QUEUES, REDIS_PREFIX, redisConnection } from '../../../shared/queues/index.js';
import { ErrorReporter, traceJob } from '../../../shared/telemetry/index.js';
import { GenerateContractPdfUseCase } from '../application/generate-contract-pdf.use-case.js';
import { GenerateInvoicePdfUseCase } from '../application/generate-invoice-pdf.use-case.js';
import { GenerateReceiptPdfUseCase } from '../application/generate-receipt-pdf.use-case.js';

const ContractPdfJob = z.object({ associationId: z.uuid(), signatureId: z.uuid() });
const InvoicePdfJob = z.object({ associationId: z.uuid(), invoiceId: z.uuid() });
const ReceiptPdfJob = z.object({ associationId: z.uuid(), paymentId: z.uuid() });

/** Traitement de la file `documents` (concurrence 2) : un PDF par job (contrat, facture, reçu de paiement). */
@Injectable()
export class DocumentsProcessor implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DocumentsProcessor.name);
  private worker: Worker | undefined;

  constructor(
    private readonly contractPdf: GenerateContractPdfUseCase,
    private readonly invoicePdf: GenerateInvoicePdfUseCase,
    private readonly receiptPdf: GenerateReceiptPdfUseCase,
    @Inject(CONFIG) private readonly config: Config,
    @Optional() private readonly reporter?: ErrorReporter,
  ) {}

  onApplicationBootstrap(): void {
    const queue = QUEUES.documents.name;
    this.worker = new Worker(
      queue,
      (job, token) =>
        runWithLogContext({ queue, jobId: job.id }, () => traceJob(queue, job, () => this.process(job, token))),
      {
        connection: redisConnection(this.config.REDIS_URL),
        prefix: REDIS_PREFIX,
        concurrency: QUEUES.documents.concurrency,
      },
    );
    this.worker.on('error', (error) => {
      this.logger.warn(`file documents : ${error.message}`);
    });
    // Le PDF reste en attente : l'échec doit se voir. Identifiants seulement, jamais le contenu du contrat.
    this.worker.on('failed', (job, error) => {
      if (error instanceof DelayedError) return;
      const attempts = `${String(job?.attemptsMade ?? 0)}/${String(QUEUES.documents.jobOptions.attempts)}`;
      this.logger.error({
        msg: 'génération de document en échec',
        job: job?.name,
        jobId: job?.id,
        attempts,
        err: error,
      });
      if (job && job.attemptsMade >= QUEUES.documents.jobOptions.attempts) {
        this.reporter?.capture(error, { queue, jobId: job.id ?? '' });
      }
    });
  }

  private async process(job: Job, token: string | undefined): Promise<void> {
    if (job.name === 'contract-pdf') return this.contractPdf.execute(ContractPdfJob.parse(job.data));
    if (job.name === 'invoice-pdf') return this.invoicePdf.execute(InvoicePdfJob.parse(job.data));
    if (job.name === 'receipt-pdf') {
      const { retryAt } = await this.receiptPdf.execute(ReceiptPdfJob.parse(job.data));
      // Délai d'annulation pas encore écoulé (horloges décalées) : repris à son terme, sans consommer de tentative.
      if (retryAt) {
        await job.moveToDelayed(retryAt.getTime() + 1_000, token);
        throw new DelayedError();
      }
      return;
    }
    throw new Error(`file documents : job inconnu ${job.name}`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
  }
}
