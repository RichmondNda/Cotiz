import type { PdfDocument } from './contract.js';
import { fontAssets, fontFaces } from './fonts.js';
import { escapeHtml } from './html.js';

/**
 * Reçu d'un paiement validé (architecture/08, lot 4.6) : établi par l'association pour le souscripteur, après le délai
 * d'annulation de la validation. Montants déjà formatés par `formatMoney` de @cotiz/domain (« 25 000 F »).
 */
export interface ReceiptDocumentInput {
  /** Identifiant du paiement : référence du reçu. */
  paymentId: string;
  /** Dates civiles `YYYY-MM-DD` (fuseau de l'association). */
  issuedOn: string;
  paidOn: string;
  validatedOn: string;
  association: { name: string; city: string | null; country: string | null };
  subscriber: { name: string };
  project: { name: string };
  methodLabel: string | null;
  transactionReference: string | null;
  amountText: string;
  /** Échéances couvertes par le paiement (répartition confirmée), par date d'échéance. */
  lines: { dueOn: string; amountText: string }[];
}

const INK_TITLE = '#26215C';
const TEXT = '#2C2A38';
const MUTED = '#6B6478';
const BORDER = '#E4E0EA';
const SURFACE_SUBTLE = '#FAF9FC';
const BRAND = '#5B51C4';

const STYLE = `
@page { size: A4; margin: 22mm 20mm 20mm 20mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Inter', Arial, sans-serif; font-size: 10.5pt; line-height: 1.55; color: ${TEXT}; }
h1 { font-family: 'Poppins', Arial, sans-serif; color: ${INK_TITLE}; margin: 0; font-size: 20pt; font-weight: 700; }
header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid ${BRAND};
  padding-bottom: 5mm; margin-bottom: 8mm; }
.issuer { font-family: 'Poppins', Arial, sans-serif; font-weight: 700; color: ${INK_TITLE}; font-size: 15pt; }
.label { color: ${MUTED}; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.03em; }
.strong { font-weight: 600; color: ${INK_TITLE}; }
.parties { display: flex; gap: 8mm; margin-bottom: 6mm; }
.parties > div { flex: 1; border: 1px solid ${BORDER}; border-radius: 3mm; padding: 4mm 5mm; }
.meta { text-align: right; }
dl { display: grid; grid-template-columns: 45mm 1fr; gap: 1.5mm 4mm; margin: 0 0 6mm; }
dt { color: ${MUTED}; }
dd { margin: 0; }
table { width: 100%; border-collapse: collapse; margin-top: 2mm; }
th, td { text-align: left; padding: 3mm; border-bottom: 1px solid ${BORDER}; vertical-align: top; }
th { color: ${MUTED}; font-weight: 400; font-size: 9pt; }
td.amount, th.amount { text-align: right; white-space: nowrap; }
.total { margin-top: 6mm; margin-left: auto; width: 60%; background: ${SURFACE_SUBTLE}; border: 1px solid ${BORDER};
  border-radius: 3mm; padding: 4mm 5mm; display: flex; justify-content: space-between; }
.total .value { font-family: 'Poppins', Arial, sans-serif; font-weight: 700; color: ${INK_TITLE}; font-size: 14pt; }
.note { color: ${MUTED}; font-size: 8.5pt; margin-top: 10mm; }
.footer { color: ${MUTED}; font-size: 8pt; margin-top: 4mm; }
`;

/** « 1er novembre 2026 » depuis une date civile, sans décalage de fuseau. */
function longDate(day: string): string {
  const text = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' }).format(
    new Date(`${day}T00:00:00Z`),
  );
  return text.replace(/^1 /, '1er ');
}

/**
 * Reçu de paiement, en HTML pour Gotenberg (Chromium). Tout texte venu des personnes est échappé ; aucune ressource
 * externe (polices jointes). Produit une seule fois et conservé sans modification (cotiz-legal).
 */
export function receiptDocument(input: ReceiptDocumentInput): PdfDocument {
  const { association } = input;
  const place = [association.city, association.country].filter((p): p is string => !!p).join(', ');
  const details: [string, string][] = [
    ['Date du paiement', longDate(input.paidOn)],
    ['Validé le', longDate(input.validatedOn)],
    ...(input.methodLabel ? ([['Moyen', input.methodLabel]] as [string, string][]) : []),
    ...(input.transactionReference
      ? ([['Référence de transaction', input.transactionReference]] as [string, string][])
      : []),
  ];
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`Reçu de paiement — ${association.name}`)}</title>
<style>
${fontFaces()}
${STYLE}
</style>
</head>
<body>
<header>
<div>
<div class="issuer">${escapeHtml(association.name)}</div>
${place ? `<div>${escapeHtml(place)}</div>` : ''}
</div>
<div class="meta">
<h1>Reçu de paiement</h1>
<div>${escapeHtml(`Établi le ${longDate(input.issuedOn)}`)}</div>
<div class="label">${escapeHtml(`Réf. ${input.paymentId}`)}</div>
</div>
</header>
<section class="parties">
<div>
<div class="label">Souscripteur</div>
<div class="strong">${escapeHtml(input.subscriber.name)}</div>
</div>
<div>
<div class="label">Projet</div>
<div class="strong">${escapeHtml(input.project.name)}</div>
</div>
</section>
<dl>
${details.map(([term, value]) => `<dt>${escapeHtml(term)}</dt><dd>${escapeHtml(value)}</dd>`).join('\n')}
</dl>
<table>
<thead><tr><th>Échéance couverte</th><th class="amount">Montant</th></tr></thead>
<tbody>
${input.lines
  .map(
    (l) =>
      `<tr class="line"><td>${escapeHtml(`Échéance du ${longDate(l.dueOn)}`)}</td>` +
      `<td class="amount">${escapeHtml(l.amountText)}</td></tr>`,
  )
  .join('\n')}
</tbody>
</table>
<div class="total"><span class="label">Montant reçu</span><span class="value">${escapeHtml(input.amountText)}</span></div>
<p class="note">Paiement déclaré par le souscripteur et validé par l’association. Le paiement s’est fait directement
auprès de l’association ; Cotiz n’en reçoit ni n’en conserve aucune somme. Ce document est conservé sans
modification possible.</p>
<p class="footer">Document établi avec Cotiz.</p>
</body>
</html>
`;
  return { html, assets: fontAssets() };
}
