import type { PdfDocument } from '@cotiz/pdf-templates';
import type { PdfRenderer } from '../domain/pdf-renderer.js';

/** Au-delà, la conversion est abandonnée (le job est repris) : un Chromium bloqué ne retient pas le worker. */
const TIMEOUT_MS = 60_000;
/** Un contrat de quelques pages pèse quelques centaines de Ko ; au-delà, réponse refusée. */
const MAX_BYTES = 20 * 1024 * 1024;

/**
 * Gotenberg 8, route Chromium `forms/chromium/convert/html` : `index.html` et ses fichiers joints (polices), format de
 * page du gabarit (`@page`, `preferCssPageSize`), arrière-plans imprimés. Aucune ressource externe n'est chargée
 * (polices jointes) ; le service n'est jamais exposé hors du réseau interne.
 */
export class GotenbergRenderer implements PdfRenderer {
  constructor(private readonly baseUrl: string) {}

  async render(document: PdfDocument): Promise<Buffer> {
    const form = new FormData();
    form.append('files', new Blob([document.html], { type: 'text/html' }), 'index.html');
    for (const asset of document.assets) form.append('files', new Blob([asset.content]), asset.name);
    form.append('preferCssPageSize', 'true');
    form.append('printBackground', 'true');
    const response = await fetch(new URL('/forms/chromium/convert/html', this.baseUrl), {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`Gotenberg : réponse ${String(response.status)}`);
    const pdf = Buffer.from(await response.arrayBuffer());
    if (pdf.length > MAX_BYTES) throw new Error('Gotenberg : PDF trop volumineux');
    if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('Gotenberg : réponse qui n’est pas un PDF');
    return pdf;
  }
}
