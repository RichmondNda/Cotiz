/**
 * Liens d'un message prêt (sans fournisseur, architecture/03) : WhatsApp et SMS depuis le téléphone du gestionnaire,
 * seulement si la personne a un numéro ; même forme que les codes d'activation (identity, buildHandoff).
 */
export function handoffLinks(
  phone: string | null,
  message: string,
): { whatsappUrl: string | null; smsUrl: string | null } {
  if (!phone) return { whatsappUrl: null, smsUrl: null };
  const text = encodeURIComponent(message);
  return { whatsappUrl: `https://wa.me/${phone.replace('+', '')}?text=${text}`, smsUrl: `sms:${phone}?body=${text}` };
}
