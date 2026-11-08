import type { PdfDocument } from '@cotiz/pdf-templates';

/** Moteur de rendu HTML → PDF (Gotenberg en production ; faux serveur dans les tests ordinaires). */
export interface PdfRenderer {
  render(document: PdfDocument): Promise<Buffer>;
}

export const PDF_RENDERER = Symbol('PDF_RENDERER');
