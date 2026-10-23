// Message prêt du refus d'une demande (aucun email envoyé : la plateforme le transmet elle-même, ui-deviations.md).

/** Texte du refus, tel qu'aperçu dans la modale puis transmis au responsable. */
export function messageRefusDemande(prenom: string, motif: string | null | undefined, precisions?: string): string {
  return [
    `Bonjour ${prenom}, nous ne pouvons pas donner suite à votre demande pour le moment.`,
    motif && `Motif : ${motif.charAt(0).toLocaleLowerCase('fr')}${motif.slice(1)}.`,
    precisions?.trim(),
  ].filter(Boolean).join(' ')
}

/** Lien `mailto:` qui ouvre la messagerie de la plateforme avec le message prêt. */
export function mailtoRefusDemande(email: string, association: string, message: string): string {
  const sujet = `Votre demande pour ${association} sur Cotiz`
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(message)}`
}
