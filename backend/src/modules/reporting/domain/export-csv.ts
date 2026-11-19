import { type MemberSummary, type ProjectReport, STATUS_LABELS } from '@cotiz/contracts';
import type { z } from 'zod';

// Exports CSV (rp.export, lot 4.6) : mêmes colonnes que les exports faits jusque-là dans le navigateur
// (frontend/app/utils/csv.ts, rapports et annuaire) ; « ; » et BOM UTF-8 pour Excel, montants en entiers de la devise.

type Cell = string | number | null;

const BOM = '\ufeff';
/** Début de cellule qu'un tableur lirait comme une formule (injection CSV) : neutralisé par une apostrophe. */
const FORMULA_START = /^[=+\-@\t\r]/;
/** Numéro E.164 (« +2250708091011 ») : `+` suivi de chiffres seulement, aucune formule possible. */
const PHONE = /^\+\d+$/;

function cell(value: Cell): string {
  const text = typeof value === 'number' ? String(value) : (value ?? '');
  const safe = typeof value === 'string' && FORMULA_START.test(text) && !PHONE.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Document CSV complet (BOM, CRLF entre enregistrements), prêt à stocker. */
export function csvDocument(rows: readonly (readonly Cell[])[]): Buffer {
  return Buffer.from(BOM + rows.map((row) => `${row.map(cell).join(';')}\r\n`).join(''), 'utf8');
}

/** « JJ/MM/AAAA » depuis une date civile `YYYY-MM-DD`. */
const civil = (day: string | null) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '');

/** Libellé de la devise dans les en-têtes : « F » pour le franc CFA (XOF), sinon le code ISO. */
const unitOf = (money: { currency: string } | undefined) => (!money || money.currency === 'XOF' ? 'F' : money.currency);

const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

/** État des cotisations d'un projet : une ligne par souscripteur du rapport (rp.report, même période). */
export function projectReportCsv(rows: z.infer<typeof ProjectReport>['rows']): Buffer {
  const unit = unitOf(rows[0]?.paid);
  return csvDocument([
    ['Souscripteur', `Attendu à date (${unit})`, `Versé (${unit})`, `Reste (${unit})`, 'Retards', 'Dernier paiement'],
    ...rows.map((r) => [
      fullName(r.member),
      r.expectedToDate.amount,
      r.paid.amount,
      r.remaining.amount,
      r.lateCount,
      civil(r.lastPaymentOn),
    ]),
  ]);
}

/** Annuaire des souscripteurs de l'association (mb.list, sans pagination). */
export function membersCsv(members: readonly z.infer<typeof MemberSummary>[]): Buffer {
  const unit = unitOf(members[0]?.totalPaid);
  return csvDocument([
    [
      'Souscripteur',
      'Téléphone',
      'Email',
      'Projets',
      `Total versé (${unit})`,
      `Total restant (${unit})`,
      'Statut global',
    ],
    ...members.map((m) => [
      fullName(m.member),
      m.member.phone,
      m.member.email,
      m.projects.map((p) => p.name).join(', '),
      m.totalPaid.amount,
      m.totalRemaining.amount,
      STATUS_LABELS.memberStanding[m.standing].label,
    ]),
  ]);
}
