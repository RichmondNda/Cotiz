// Surface du module documents pour les autres modules (architecture/01) : moteur HTML → PDF (Gotenberg), partagé par
// les exports du module reporting (lot 4.6).
import type { Provider } from '@nestjs/common';
import { CONFIG, type Config } from '../../config.js';
import { PDF_RENDERER, type PdfRenderer } from './domain/pdf-renderer.js';
import { GotenbergRenderer } from './infra/gotenberg-renderer.js';

export { PDF_RENDERER, type PdfRenderer } from './domain/pdf-renderer.js';

/** Sans GOTENBERG_URL (hors production) : tout rendu échoue, le PDF reste en attente. Jamais produit par défaut. */
const missingRenderer: PdfRenderer = {
  render: () => Promise.reject(new Error('PDF : GOTENBERG_URL manquante')),
};

/** Fournisseur du moteur PDF d'un module worker (`PDF_RENDERER`). */
export const pdfRendererProvider: Provider = {
  provide: PDF_RENDERER,
  inject: [CONFIG],
  useFactory: (config: Config): PdfRenderer =>
    config.GOTENBERG_URL ? new GotenbergRenderer(config.GOTENBERG_URL) : missingRenderer,
};
