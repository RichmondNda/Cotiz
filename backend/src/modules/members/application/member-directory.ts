import { Injectable } from '@nestjs/common';
import { type Enrollment, MemberStanding } from '@cotiz/contracts';
import { enrollments } from '@cotiz/db';
import type { IsoDate } from '@cotiz/domain';
import { and, eq, sql } from 'drizzle-orm';
import { accountMatches, SubscriberAccounts, type SubscriberContact } from '../../identity/identity.public.js';
import { type ProjectRecord, projectsOf } from '../../projects/projects.public.js';
import { DomainProblem } from '../../../shared/http/index.js';
import { type Cursor, decodeCursor } from '../../../shared/pagination/index.js';
import { currentTx } from '../../../shared/tenant-context/index.js';
import type { EnrollmentRecord } from './enrollment-records.js';
import { enrollmentView, type InstallmentRecord, installmentsByEnrollment } from './enrollment-views.js';

/** Une inscription chargée, avec de quoi la présenter : projet, compte, échéances, vue calculée par le domaine. */
export interface EnrollmentEntry {
  row: EnrollmentRecord;
  /** `joined_at` en texte UTC à la microseconde, de largeur fixe : clé de tri et de curseur exacte. */
  at: string;
  project: ProjectRecord;
  member: SubscriberContact;
  lines: InstallmentRecord[];
  view: Enrollment;
}

/** Texte de largeur fixe (comparable comme chaîne), au format accepté par les curseurs. */
const AT = sql<string>`to_char(${enrollments.joinedAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'`;

/**
 * Inscriptions de l'association du contexte (RLS), chargées avec ce qu'il faut pour les présenter (onglet
 * Souscripteurs, annuaire, fiche). La situation se calcule par le domaine sur les échéances chargées (choix de
 * l'étape 6 : le statut persisté n'est tenu à jour qu'au lot 2.4) ; filtre par situation, compteurs et pages se font
 * donc en mémoire, après un préfiltre SQL (projet, personne, recherche).
 */
@Injectable()
export class MemberDirectory {
  constructor(private readonly accounts: SubscriberAccounts) {}

  async entries(
    associationId: string,
    today: IsoDate,
    filter: { projectId?: string | undefined; userId?: string | undefined; q?: string | undefined },
  ): Promise<EnrollmentEntry[]> {
    const rows = await currentTx()
      .select({ row: enrollments, at: AT })
      .from(enrollments)
      .where(
        and(
          eq(enrollments.associationId, associationId),
          filter.projectId ? eq(enrollments.projectId, filter.projectId) : undefined,
          filter.userId ? eq(enrollments.userId, filter.userId) : undefined,
          filter.q ? accountMatches(enrollments.userId, filter.q) : undefined,
        ),
      );
    // Une transaction = une connexion : lectures l'une après l'autre.
    const projects = await projectsOf(
      associationId,
      rows.map((r) => r.row.projectId),
    );
    const members = await this.accounts.contactsOf([...new Set(rows.map((r) => r.row.userId))]);
    const lines = await installmentsByEnrollment(rows.map((r) => r.row.id));
    return rows.map(({ row, at }) => {
      const project = projects.get(row.projectId);
      const member = members.get(row.userId);
      if (!project || !member) throw new Error('MemberDirectory : projet ou compte d’une inscription introuvable');
      const installments = lines.get(row.id) ?? [];
      return {
        row,
        at,
        project,
        member,
        lines: installments,
        view: enrollmentView(row, project, member, today, installments),
      };
    });
  }
}

/** Compteurs par situation, toutes les situations présentes (0 compris). */
export function standingFacets(standings: readonly MemberStanding[]): Record<MemberStanding, number> {
  const counts = Object.fromEntries(MemberStanding.options.map((s) => [s, 0])) as Record<MemberStanding, number>;
  for (const standing of standings) counts[standing] += 1;
  return counts;
}

/** Curseur reçu, validé (`validation_failed` s'il est illisible) ; tri non pris en charge refusé. */
export function listPosition(query: { cursor?: string | undefined; sort?: string | undefined }): Cursor | null {
  if (query.sort !== undefined) throw new DomainProblem('validation_failed', { fields: { sort: 'unknown_sort' } });
  if (query.cursor === undefined) return null;
  const cursor = decodeCursor(query.cursor);
  if (!cursor) throw new DomainProblem('validation_failed', { fields: { cursor: 'invalid' } });
  return cursor;
}

/** Page en mémoire, les plus récents d'abord (clé, identifiant), après la position donnée. */
export function pageOf<T>(
  items: readonly T[],
  key: (item: T) => Cursor,
  after: Cursor | null,
  limit: number,
): { items: T[]; next: Cursor | null } {
  const sorted = [...items].sort((a, b) => compareDesc(key(a), key(b)));
  const start = after ? sorted.filter((item) => compareDesc(key(item), after) > 0) : sorted;
  const page = start.slice(0, limit);
  const last = page.at(-1);
  return { items: page, next: start.length > limit && last ? key(last) : null };
}

function compareDesc(a: Cursor, b: Cursor): number {
  if (a.at !== b.at) return a.at < b.at ? 1 : -1;
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}
