/** Référence d'une demande, affichée sur la confirmation : `DEM-2026-00042` (année de dépôt, numéro de la séquence). */
export function requestReference(year: number, number: number | bigint): string {
  return `DEM-${String(year)}-${String(number).padStart(5, '0')}`;
}
