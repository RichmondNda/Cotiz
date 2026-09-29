# ADR 0010 · Aucun fournisseur externe avant le groupe 6

**Statut :** adopté · 2026-09-29

## Décision

SMS, email, paiement en ligne, captcha hébergé, polices distantes : exclus des lots 0.1 à 5.2. Les codes et relances sont remis par une personne (message prêt) ; les notifications passent par l'in-app, le SSE et le Web Push standard. Les fournisseurs arrivent comme options (6.1 email, 6.2 SMS, 6.3 paiement) derrière `NotificationChannel` et `features`.

## Pourquoi

Aucun coût variable, aucune dépendance contractuelle, aucune donnée personnelle confiée à un tiers, démarrage immédiat. Contrepartie : le gestionnaire remet les codes (indicateur « comptes non activés », fiche imprimable, WhatsApp en un clic). **Remplace** l'ADR-10 du document d'architecture HTML (fournisseurs dès la V1).

## Alternatives écartées

SMS d'activation dès la V1 (coût, enregistrement d'expéditeur, délais) ; email transactionnel dès la V1.
