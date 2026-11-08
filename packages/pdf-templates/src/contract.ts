import { fontAssets, fontFaces, type PdfAsset } from './fonts.js';
import { escapeHtml, paragraphs } from './html.js';

/** Contrat signé par un souscripteur : texte rendu tel que signé (même empreinte) et éléments de preuve. */
export interface ContractDocumentInput {
  association: { name: string };
  project: { name: string };
  /** Texte rendu par renderContract() de @cotiz/domain, celui dont `signature.renderedSha256` est l'empreinte. */
  body: string;
  associationSigner: { name: string; title: string; signedAt: string };
  subscriber: { name: string; phone: string | null };
  signature: {
    id: string;
    enrollmentId: string;
    /** Instant ISO 8601 (UTC). */
    signedAt: string;
    ip: string | null;
    userAgent: string | null;
    consentText: string;
    renderedSha256: string;
    templateSha256: string;
  };
  /** Fuseau de l'association (dates lisibles) ; l'instant UTC figure aussi sur la page de preuve. */
  timezone: string;
}

export interface PdfDocument {
  /** `index.html` du rendu. */
  html: string;
  /** Fichiers joints, référencés par leur nom depuis le HTML. */
  assets: PdfAsset[];
}

/** Couleurs de la charte (frontend/app/assets/css/cotiz-tokens.css). */
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
h1, h2 { font-family: 'Poppins', Arial, sans-serif; color: ${INK_TITLE}; margin: 0; }
h1 { font-size: 18pt; font-weight: 700; line-height: 1.25; }
h2 { font-size: 12pt; font-weight: 600; margin: 0 0 4mm; }
header { border-bottom: 2px solid ${BRAND}; padding-bottom: 4mm; margin-bottom: 7mm; }
header .association { font-family: 'Poppins', Arial, sans-serif; font-weight: 600; color: ${BRAND}; font-size: 10pt;
  text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 2mm; }
.body p { margin: 0 0 3.5mm; text-align: justify; }
.signatures { display: flex; gap: 8mm; margin-top: 10mm; page-break-inside: avoid; }
.signatures > div { flex: 1; border: 1px solid ${BORDER}; border-radius: 3mm; padding: 4mm 5mm; }
.label { color: ${MUTED}; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.03em; }
.strong { font-weight: 600; color: ${INK_TITLE}; }
.proof { page-break-before: always; }
.proof table { width: 100%; border-collapse: collapse; }
.proof th, .proof td { text-align: left; vertical-align: top; padding: 2.5mm 3mm; border-bottom: 1px solid ${BORDER}; }
.proof th { width: 34%; color: ${MUTED}; font-weight: 400; }
.proof td { word-break: break-all; }
.proof .consent { background: ${SURFACE_SUBTLE}; border: 1px solid ${BORDER}; border-radius: 3mm; padding: 4mm 5mm;
  margin: 5mm 0; }
.proof .note { color: ${MUTED}; font-size: 8.5pt; margin-top: 6mm; }
.mono { font-family: ui-monospace, Menlo, monospace; font-size: 9pt; }
`;

/** Date et heure lisibles dans le fuseau de l'association (« 8 novembre 2026 à 14:30:05 »). */
function localDateTime(instant: string, timezone: string): string {
  const text = new Intl.DateTimeFormat('fr-FR', { timeZone: timezone, dateStyle: 'long', timeStyle: 'medium' }).format(
    new Date(instant),
  );
  // Premier du mois : « 1er novembre » (Intl écrit « 1 novembre »).
  return text.replace(/^1 /, '1er ');
}

function row(label: string, value: string, options: { mono?: boolean } = {}): string {
  return `<tr><th>${escapeHtml(label)}</th><td${options.mono ? ' class="mono"' : ''}>${escapeHtml(value)}</td></tr>`;
}

const NOT_RECORDED = 'non enregistré';

/**
 * Contrat signé + page de preuve (architecture/08, lot 4.1), en HTML pour Gotenberg (Chromium). Tout texte venu des
 * personnes est échappé ; aucune ressource externe (polices jointes). Déterministe pour une même entrée ; le PDF, lui,
 * n'est produit qu'une fois et n'est jamais régénéré (empreinte conservée dans `files.sha256`).
 */
export function contractDocument(input: ContractDocumentInput): PdfDocument {
  const { association, project, signature, subscriber, associationSigner, timezone } = input;
  const signedLocal = localDateTime(signature.signedAt, timezone);
  const associationSignedLocal = localDateTime(associationSigner.signedAt, timezone);
  const html = `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>${escapeHtml(`Contrat — ${project.name}`)}</title>
<style>
${fontFaces()}
${STYLE}
</style>
</head>
<body>
<header>
<div class="association">${escapeHtml(association.name)}</div>
<h1>${escapeHtml(`Contrat d’engagement — ${project.name}`)}</h1>
</header>
<main class="body">
${paragraphs(input.body)}
</main>
<section class="signatures">
<div>
<div class="label">Pour l’association</div>
<div class="strong">${escapeHtml(associationSigner.name)}</div>
<div>${escapeHtml(associationSigner.title)}</div>
<div>${escapeHtml(`Signé le ${associationSignedLocal}`)}</div>
</div>
<div>
<div class="label">Le souscripteur</div>
<div class="strong">${escapeHtml(subscriber.name)}</div>
<div>${escapeHtml(`Signé électroniquement le ${signedLocal}`)}</div>
</div>
</section>
<section class="proof">
<h2>Page de preuve</h2>
<p>Éléments enregistrés au moment de la signature électronique de ce contrat.</p>
<table>
${row('Souscripteur', subscriber.name)}
${row('Téléphone', subscriber.phone ?? NOT_RECORDED)}
${row('Association', association.name)}
${row('Projet', project.name)}
${row('Signé pour l’association par', `${associationSigner.name}, ${associationSigner.title}`)}
${row('Signature de l’association', associationSignedLocal)}
${row('Date et heure de signature', `${signedLocal} (${timezone})`)}
${row('Instant de signature (UTC)', signature.signedAt, { mono: true })}
${row('Adresse IP', signature.ip ?? NOT_RECORDED, { mono: true })}
${row('Navigateur', signature.userAgent ?? NOT_RECORDED)}
${row('Empreinte SHA-256 du texte signé', signature.renderedSha256, { mono: true })}
${row('Empreinte SHA-256 du modèle', signature.templateSha256, { mono: true })}
${row('Identifiant de la signature', signature.id, { mono: true })}
${row('Identifiant de l’inscription', signature.enrollmentId, { mono: true })}
</table>
<div class="consent">
<div class="label">Consentement accepté</div>
<div>${escapeHtml(signature.consentText)}</div>
</div>
<p class="note">L’empreinte SHA-256 du texte signé est calculée sur le texte du contrat tel qu’il a été présenté au
souscripteur ; toute modification du texte change cette empreinte. Ce document est conservé sans modification
possible.</p>
</section>
</body>
</html>
`;
  return { html, assets: fontAssets() };
}
