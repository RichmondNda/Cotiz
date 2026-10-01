import { z } from 'zod';

/** Couleur fonctionnelle (status-mapping.yaml), ou couleur de l'espace (`brand`) pour un événement neutre. */
export const EventTone = z.enum(['success', 'danger', 'warning', 'info', 'neutral', 'brand']);
