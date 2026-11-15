import type { PdfDocument } from './contract.js';
import { fontAssets, fontFaces } from './fonts.js';
import { escapeHtml } from './html.js';

/** Facture d'abonnement de la plateforme à une association (architecture/08, lot 4.6). */
export interface InvoiceDocumentInput {
  number: string;
  /** Dates civiles `YYYY-MM-DD` (fuseau de l'association). */
  issuedOn: string;
  dueOn: string;
  periodStart: string;
  periodEnd: string;
  association: { name: string; city: string | null; country: string | null; email: string | null };
  plan: { name: string; billingPeriod: 'monthly' | 'yearly' };
  /** Montant déjà formaté par `formatMoney` de @cotiz/domain (« 10 000 F »). */
  amountText: string;
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
.brand { font-family: 'Poppins', Arial, sans-serif; font-weight: 700; color: ${BRAND}; font-size: 16pt; }
.label { color: ${MUTED}; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.03em; }
.strong { font-weight: 600; color: ${INK_TITLE}; }
.parties { display: flex; gap: 8mm; margin-bottom: 8mm; }
.parties > div { flex: 1; border: 1px solid ${BORDER}; border-radius: 3mm; padding: 4mm 5mm; }
.meta { text-align: right; }
table { width: 100%; border-collapse: collapse; margin-top: 4mm; }
th, td { text-align: left; padding: 3mm; border-bottom: 1px solid ${BORDER}; vertical-align: top; }
th { color: ${MUTED}; font-weight: 400; font-size: 9pt; }
td.amount, th.amount { text-align: right; white-space: nowrap; }
.total { margin-top: 6mm; margin-left: auto; width: 60%; background: ${SURFACE_SUBTLE}; border: 1px solid ${BORDER};
  border-radius: 3mm; padding: 4mm 5mm; display: flex; justify-content: space-between; }
.total .value { font-family: 'Poppins', Arial, sans-serif; font-weight: 700; color: ${INK_TITLE}; font-size: 14pt; }
.note { color: ${MUTED}; font-size: 8.5pt; margin-top: 10mm; }
`;

/** « 1er novembre 2026 » depuis une date civile, sans décalage de fuseau. */
function longDate(day: string): string {
  const text = new Intl.DateTimeFormat('fr-FR', { timeZone: 'UTC', dateStyle: 'long' }).format(
    new Date(`${day}T00:00:00Z`),
  );
  return text.replace(/^1 /, '1er ');
}

const PERIOD_LABEL = { monthly: 'mensuel', yearly: 'annuel' } as const;

/**
 * Facture d'abonnement, en HTML pour Gotenberg (Chromium). Tout texte venu des personnes est échappé ; aucune
 * ressource externe (polices jointes). Produite une seule fois et conservée sans modification (cotiz-legal).
 */
export function invoiceDocument(input: InvoiceDocumentInput): PdfDocument {
  const { association, plan } = input;
  const place = [association.city, association.country].filter((p): p is string => !!p).join(', ');
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`Facture ${input.number}`)}</title>
<style>
${fontFaces()}
${STYLE}
</style>
</head>
<body>
<header>
<div>
<div class="brand">Cotiz</div>
<div>Plateforme de gestion des cotisations</div>
</div>
<div class="meta">
<h1>Facture</h1>
<div class="strong">${escapeHtml(input.number)}</div>
<div>${escapeHtml(`Émise le ${longDate(input.issuedOn)}`)}</div>
<div>${escapeHtml(`À régler au plus tard le ${longDate(input.dueOn)}`)}</div>
</div>
</header>
<section class="parties">
<div>
<div class="label">Facturé à</div>
<div class="strong">${escapeHtml(association.name)}</div>
${place ? `<div>${escapeHtml(place)}</div>` : ''}
${association.email ? `<div>${escapeHtml(association.email)}</div>` : ''}
</div>
<div>
<div class="label">Période</div>
<div class="strong">${escapeHtml(`Du ${longDate(input.periodStart)} au ${longDate(input.periodEnd)}`)}</div>
</div>
</section>
<table>
<thead><tr><th>Désignation</th><th class="amount">Montant</th></tr></thead>
<tbody>
<tr><td>${escapeHtml(`Abonnement ${plan.name} (${PERIOD_LABEL[plan.billingPeriod]})`)}</td>
<td class="amount">${escapeHtml(input.amountText)}</td></tr>
</tbody>
</table>
<div class="total"><span class="label">Total dû</span><span class="value">${escapeHtml(input.amountText)}</span></div>
<p class="note">Le règlement se fait hors plateforme (virement, mobile money ou espèces) ; l’équipe Cotiz enregistre
le paiement à réception. Ce document est conservé sans modification possible.</p>
</body>
</html>
`;
  return { html, assets: fontAssets() };
}
