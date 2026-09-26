// Date « du jour » de la V0. Les maquettes sont figées au vendredi 25 septembre 2026
// (« il y a 3 j », « dans 10 jours » avant le 5 octobre…). Tant que les données sont mockées,
// toute date relative se calcule à partir de cette référence, côté app comme côté serveur.
// Au branchement de l'API NestJS, remplacer par `new Date()`.

export const DATE_REFERENCE = '2026-09-25T10:00:00'

export function maintenant(): Date {
  return new Date(DATE_REFERENCE)
}
