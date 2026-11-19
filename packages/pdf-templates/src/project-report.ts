import type { PdfDocument } from './contract.js';
import { fontAssets, fontFaces } from './fonts.js';
import { escapeHtml } from './html.js';

/** Rapport d'un projet (export PDF de mg-projet-rapports, rp.export, lot 4.6). Montants déjà formatés (`formatMoney`). */
export interface ProjectReportDocumentInput {
  association: { name: string };
  project: { name: string };
  /** Date civile `YYYY-MM-DD` (fuseau de l'association). */
  generatedOn: string;
  /** Période du rapport (dates d'échéance comprises) ; `null` : sans borne. */
  period: { from: string | null; to: string | null };
  totals: { expectedText: string; receivedText: string; remainingText: string; recoveryRate: number | null };
  rows: {
    name: string;
    expectedText: string;
    paidText: string;
    remainingText: string;
    lateCount: number;
    lastPaymentOn: string | null;
  }[];
}

const INK_TITLE = '#26215C';
const TEXT = '#2C2A38';
const MUTED = '#6B6478';
const BORDER = '#E4E0EA';
const SURFACE_SUBTLE = '#FAF9FC';
const BRAND = '#5B51C4';

const STYLE = `
@page { size: A4; margin: 18mm 15mm 18mm 15mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Inter', Arial, sans-serif; font-size: 9.5pt; line-height: 1.45; color: ${TEXT}; }
h1 { font-family: 'Poppins', Arial, sans-serif; color: ${INK_TITLE}; margin: 0; font-size: 17pt; font-weight: 700; }
header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${BRAND};
  padding-bottom: 4mm; margin-bottom: 6mm; }
.brand { font-family: 'Poppins', Arial, sans-serif; font-weight: 700; color: ${BRAND}; font-size: 14pt; }
.meta { text-align: right; color: ${MUTED}; }
.kpis { display: flex; gap: 4mm; margin-bottom: 6mm; }
.kpis > div { flex: 1; border: 1px solid ${BORDER}; border-radius: 3mm; padding: 3mm 4mm; background: ${SURFACE_SUBTLE}; }
.label { color: ${MUTED}; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.03em; }
.value { font-family: 'Poppins', Arial, sans-serif; font-weight: 700; color: ${INK_TITLE}; font-size: 12pt; }
table { width: 100%; border-collapse: collapse; }
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th, td { text-align: left; padding: 2mm 2.5mm; border-bottom: 1px solid ${BORDER}; }
th { color: ${MUTED}; font-weight: 400; font-size: 8pt; }
.num { text-align: right; white-space: nowrap; }
`;

/** « 1er novembre 2026 » depuis une date civile, sans décalage de fuseau. */
function longDate(day: string): string {
  const text = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' }).format(
    new Date(`${day}T00:00:00Z`),
  );
  return text.replace(/^1 /, '1er ');
}

const shortDate = (day: string | null) => (day ? `${day.slice(8, 10)}/${day.slice(5, 7)}/${day.slice(0, 4)}` : '—');

function periodLabel({ from, to }: ProjectReportDocumentInput['period']): string {
  if (from && to) return `Échéances du ${longDate(from)} au ${longDate(to)}`;
  if (from) return `Échéances à partir du ${longDate(from)}`;
  if (to) return `Échéances jusqu’au ${longDate(to)}`;
  return 'Toutes les échéances';
}

/** Taux en pourcentage entier (« 30 % », espace insécable), tiret sans attendu. */
const rate = (value: number | null) => (value === null ? '—' : `${String(Math.round(value * 100))}\u00a0%`);

/**
 * Rapport d'un projet, en HTML pour Gotenberg (Chromium) : chiffres clés puis état des cotisations par souscripteur
 * (mêmes colonnes que l'export CSV). Tout texte venu des personnes est échappé ; aucune ressource externe.
 */
export function projectReportDocument(input: ProjectReportDocumentInput): PdfDocument {
  const { totals } = input;
  const kpi = (label: string, value: string) =>
    `<div><div class="label">${escapeHtml(label)}</div>\n<div class="value">${escapeHtml(value)}</div></div>`;
  const rows = input.rows
    .map(
      (r) =>
        `<tr class="row"><td>${escapeHtml(r.name)}</td><td class="num">${escapeHtml(r.expectedText)}</td>` +
        `<td class="num">${escapeHtml(r.paidText)}</td><td class="num">${escapeHtml(r.remainingText)}</td>` +
        `<td class="num">${String(r.lateCount)}</td><td class="num">${shortDate(r.lastPaymentOn)}</td></tr>`,
    )
    .join('\n');
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`Rapport — ${input.project.name}`)}</title>
<style>
${fontFaces()}
${STYLE}
</style>
</head>
<body>
<header>
<div>
<div class="brand">Cotiz</div>
<div>${escapeHtml(input.association.name)}</div>
</div>
<div class="meta">
<h1>${escapeHtml(input.project.name)}</h1>
<div>${escapeHtml(periodLabel(input.period))}</div>
<div>${escapeHtml(`Établi le ${longDate(input.generatedOn)}`)}</div>
</div>
</header>
<section class="kpis">
${kpi('Attendu à date', totals.expectedText)}
${kpi('Recouvré', totals.receivedText)}
${kpi('Reste à recouvrer', totals.remainingText)}
${kpi('Taux de recouvrement', rate(totals.recoveryRate))}
</section>
<table>
<thead><tr><th>Souscripteur</th><th class="num">Attendu à date</th><th class="num">Versé</th><th class="num">Reste</th>
<th class="num">Retards</th><th class="num">Dernier paiement</th></tr></thead>
<tbody>
${rows}
</tbody>
</table>
</body>
</html>
`;
  return { html, assets: fontAssets() };
}
