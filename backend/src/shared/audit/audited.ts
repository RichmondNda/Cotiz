import { AsyncLocalStorage } from 'node:async_hooks';
import { isIP } from 'node:net';
import { auditLogs } from '@cotiz/db';
import { currentRequestInfo } from '../request-info/index.js';
import { currentContext, currentTx } from '../tenant-context/index.js';
import { auditDiff } from './audit-diff.js';

/** Entité touchée par un cas d'usage audité. `before`/`after` complets : seuls les champs modifiés sont gardés. */
export interface AuditRecord {
  entityType: string;
  entityId: string | null;
  /**
   * Association de l'entité. En espace association, c'est toujours celle du contexte (déduite si absente) ;
   * ailleurs (souscripteur, plateforme), celle de l'entité, pour que l'association lise son journal.
   */
  associationId?: string | null;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}

/** `payment.validate`, `association.suspend`… (schema.sql : audit_logs.action). */
const ACTION = /^[a-z][a-z_]*(\.[a-z][a-z_]*)+$/;

interface AuditScope {
  action: string;
  records: AuditRecord[];
  /** Posé une fois les entrées écrites : une continuation détachée ne peut plus en ajouter (elle serait perdue). */
  closed: boolean;
}

const scope = new AsyncLocalStorage<AuditScope>();

/** Décrit l'entité touchée par le cas d'usage audité en cours ; l'entrée est écrite à sa réussite. */
export function recordAudit(record: AuditRecord): void {
  const current = scope.getStore();
  if (!current) throw new Error('recordAudit() appelé hors d’un cas d’usage @Audited');
  if (current.closed) throw new Error(`recordAudit() : le cas d’usage ${current.action} est terminé`);
  current.records.push(record);
}

/**
 * Cas d'usage sensible (architecture/02, 13) : à sa réussite, une entrée d'audit par entité décrite par
 * `recordAudit()`, écrite dans la même transaction (annulée avec elle). Acteur et association viennent du contexte
 * tenant ; identifiant de requête, IP et user-agent de la requête HTTP. Un cas d'usage audité qui ne décrit aucune
 * entité est une erreur de programmation : il échoue.
 */
export function Audited(action: string): MethodDecorator {
  if (!ACTION.test(action)) throw new Error(`@Audited : action mal formée (${JSON.stringify(action)})`);
  return (_target, _key, descriptor) => {
    const original = descriptor.value as unknown;
    if (typeof original !== 'function') throw new Error('@Audited s’applique à une méthode');
    const wrapped = async function (this: unknown, ...args: unknown[]): Promise<unknown> {
      const current: AuditScope = { action, records: [], closed: false };
      const result: unknown = await scope.run(current, () =>
        (original as (...a: unknown[]) => unknown).apply(this, args),
      );
      current.closed = true;
      if (current.records.length === 0) {
        throw new Error(`@Audited('${action}') : aucune entité décrite par recordAudit()`);
      }
      for (const record of current.records) await write(action, record);
      return result;
    };
    // Les métadonnées des décorateurs Nest posés avant (@Get…) restent sur la nouvelle fonction.
    for (const key of Reflect.getOwnMetadataKeys(original)) {
      Reflect.defineMetadata(key, Reflect.getOwnMetadata(key, original), wrapped);
    }
    (descriptor as PropertyDescriptor).value = wrapped;
  };
}

async function write(action: string, record: AuditRecord): Promise<void> {
  const context = currentContext();
  let associationId = record.associationId ?? null;
  if (context?.space === 'association') {
    // La base accepte toute association (politique append) : on n'écrit jamais au journal d'une autre.
    if (record.associationId !== undefined && record.associationId !== context.associationId) {
      throw new Error(`@Audited('${action}') : l’entrée doit porter l’association du contexte`);
    }
    associationId = context.associationId ?? null;
  }
  const request = currentRequestInfo();
  const { before, after } = auditDiff(record.before, record.after);
  await currentTx()
    .insert(auditLogs)
    .values({
      actorUserId: context?.userId ?? null,
      // Rôle posé par les gardes ; à défaut, l'espace (system pour le worker, subscriber…), ou anonymous.
      actorRole: request?.actorRole ?? context?.space ?? 'anonymous',
      associationId,
      action,
      entityType: record.entityType,
      entityId: record.entityId,
      before,
      after,
      requestId: request?.requestId ?? null,
      ip: request?.ip && isIP(request.ip) !== 0 ? request.ip : null,
      userAgent: request?.userAgent ?? null,
    });
}
