import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { exportJobs, files } from '@cotiz/db';
import { exportExpiresAt, formatMoney, newId } from '@cotiz/domain';
import { type PdfDocument, projectReportDocument } from '@cotiz/pdf-templates';
import { eq } from 'drizzle-orm';
import { holdsPermission, managementAccessIn } from '../../access/access.public.js';
import { PDF_RENDERER, type PdfRenderer } from '../../documents/documents.public.js';
import { associationToday, MemberDirectory, memberSummariesOf } from '../../members/members.public.js';
import { projectOf } from '../../projects/projects.public.js';
import { ownAssociationOf } from '../../tenancy/tenancy.public.js';
import { OutboxService } from '../../../shared/outbox/index.js';
import { BUCKETS, StorageService } from '../../../shared/storage/index.js';
import { currentTx, TenantDatabase } from '../../../shared/tenant-context/index.js';
import { membersCsv, projectReportCsv } from '../domain/export-csv.js';
import { exportOf, ExportParams, type ExportRecord } from './export-records.js';
import { GetProjectReportUseCase } from './get-project-report.use-case.js';

const CSV = 'text/csv; charset=utf-8' as const;

/** Export préparé : contenu CSV déjà produit, ou document PDF à rendre (hors transaction). */
type Prepared = { fileName: string } & (
  { mimeType: typeof CSV; content: Buffer } | { mimeType: 'application/pdf'; document: PdfDocument }
);

const sha256 = (content: Buffer) => createHash('sha256').update(content).digest('hex');

/** Nom de fichier lisible et sûr : sans accents ni séparateurs (« Tontine 2026 » → « tontine-2026 »). */
const slug = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'projet';

/**
 * Production d'un export (file `exports`, lot 4.6), dans le contexte de l'association :
 * 1. export verrouillé : déjà produit ou en échec → rien ; demandeur qui n'a plus le droit `reports.export` dans
 *    l'association → `failed` ; sinon `running` (COMMIT) ;
 * 2. données lues au jour de l'association avec les mêmes calculs que les écrans (rp.report, mb.list), CSV en mémoire
 *    ou PDF par Gotenberg (hors transaction) ;
 * 3. objet écrit dans `cotiz-exports`, puis ligne `files` (`export`, analysé d'office : produit par le serveur, empreinte,
 *    expiration à 7 jours), export `done` et `export.completed` (notification du demandeur) dans une transaction.
 * Rejoué après une panne : produit de nouveau (un objet écrit sans COMMIT expire avec son compartiment).
 */
@Injectable()
export class GenerateExportUseCase {
  private readonly logger = new Logger(GenerateExportUseCase.name);

  constructor(
    private readonly db: TenantDatabase,
    private readonly storage: StorageService,
    private readonly outbox: OutboxService,
    private readonly directory: MemberDirectory,
    private readonly report: GetProjectReportUseCase,
    @Inject(PDF_RENDERER) private readonly renderer: PdfRenderer,
  ) {}

  async execute(job: { associationId: string; exportId: string }): Promise<void> {
    const { associationId, exportId } = job;
    const inAssociation = <T>(run: () => Promise<T>) =>
      this.db.withTenantContext({ space: 'association', associationId }, run);

    const claimed = await inAssociation(() => this.claim(associationId, exportId));
    if (!claimed) return;
    const prepared = await inAssociation(() => this.prepare(claimed));
    const content = prepared.mimeType === CSV ? prepared.content : await this.renderer.render(prepared.document);

    const fileId = newId();
    const extension = prepared.mimeType === CSV ? 'csv' : 'pdf';
    const objectKey = `${associationId}/export/${fileId}.${extension}`;
    const bucket = BUCKETS.export;
    await this.storage.putObject(bucket, objectKey, content, prepared.mimeType);

    await inAssociation(async () => {
      const tx = currentTx();
      const current = await exportOf(associationId, exportId, { lock: true });
      if (current?.status !== 'running') return;
      const producedAt = new Date();
      await tx.insert(files).values({
        id: fileId,
        associationId,
        ownerUserId: current.requestedBy,
        purpose: 'export',
        bucket,
        objectKey,
        originalName: prepared.fileName,
        mimeType: prepared.mimeType,
        sizeBytes: content.length,
        sha256: sha256(content),
        scanStatus: 'clean',
        // Même horloge pour la production et l'expiration (7 jours exactement).
        createdAt: producedAt,
        expiresAt: exportExpiresAt(producedAt),
      });
      await tx.update(exportJobs).set({ status: 'done', fileId }).where(eq(exportJobs.id, exportId));
      await this.outbox.publish(tx, {
        type: 'export.completed',
        associationId,
        actorUserId: current.requestedBy,
        aggregate: { type: 'export', id: exportId },
        payload: { exportId, fileId },
      });
    });
    this.logger.log({ msg: 'export produit', exportId, kind: claimed.kind, bytes: content.length });
  }

  /** Export à produire, passé `running` ; `null` s'il n'y a rien à faire. */
  private async claim(associationId: string, exportId: string): Promise<ExportRecord | null> {
    const job = await exportOf(associationId, exportId, { lock: true });
    if (!job || job.status === 'done' || job.status === 'failed') return null;
    const access = await managementAccessIn(job.requestedBy, associationId);
    const allowed = access && holdsPermission('reports.export', { role: `association:${access.role}` });
    if (!allowed) {
      await currentTx().update(exportJobs).set({ status: 'failed' }).where(eq(exportJobs.id, exportId));
      this.logger.warn({ msg: 'export arrêté : demandeur sans droit d’export', exportId });
      return null;
    }
    if (job.status === 'queued') {
      await currentTx().update(exportJobs).set({ status: 'running' }).where(eq(exportJobs.id, exportId));
    }
    return job;
  }

  /** Données lues dans la transaction ; le PDF est rendu après (Gotenberg, hors transaction). */
  private async prepare(job: ExportRecord): Promise<Prepared> {
    const { associationId } = job;
    const params = ExportParams.parse(job.params);
    const today = await associationToday(associationId);

    if (job.kind === 'members_csv') {
      const entries = await this.directory.entries(associationId, today, {});
      const members = memberSummariesOf(entries, { projectId: params.projectId })
        .sort((a, b) => (a.at === b.at ? 0 : a.at < b.at ? 1 : -1))
        .map((m) => m.summary);
      return { content: membersCsv(members), mimeType: CSV, fileName: `souscripteurs-${today}.csv` };
    }

    if (!params.projectId) throw new Error(`export ${job.id} : rapport sans projet`);
    const project = await projectOf(associationId, params.projectId);
    if (!project) throw new Error(`export ${job.id} : projet introuvable`);
    const report = await this.report.execute(associationId, params.projectId, { from: params.from, to: params.to });
    const base = `rapport-${slug(project.name)}-${today}`;
    if (job.kind === 'project_report_csv') {
      return { content: projectReportCsv(report.rows), mimeType: CSV, fileName: `${base}.csv` };
    }

    const association = await ownAssociationOf(associationId);
    const document = projectReportDocument({
      association: { name: association?.name ?? '' },
      project: { name: project.name },
      generatedOn: today,
      period: { from: params.from ?? null, to: params.to ?? null },
      totals: {
        expectedText: formatMoney(report.expected),
        receivedText: formatMoney(report.received),
        remainingText: formatMoney(report.remaining),
        recoveryRate: report.recoveryRate,
      },
      rows: report.rows.map((r) => ({
        name: `${r.member.firstName} ${r.member.lastName}`.trim(),
        expectedText: formatMoney(r.expectedToDate),
        paidText: formatMoney(r.paid),
        remainingText: formatMoney(r.remaining),
        lateCount: r.lateCount,
        lastPaymentOn: r.lastPaymentOn,
      })),
    });
    return { mimeType: 'application/pdf', fileName: `${base}.pdf`, document };
  }
}
