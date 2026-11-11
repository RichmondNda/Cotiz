# 07 · Notifications et canaux

## Chaîne
Événement métier → consommateur `notifications` → **routeur** (qui reçoit, par quels canaux, selon la matrice ci-dessous, cohérente avec les consommateurs de [../specs/events.yaml](../specs/events.yaml), et les préférences) → `notifications` (cloche) + `deliveries` (un envoi par canal externe) → canal.

## Interface `NotificationChannel`
```ts
interface NotificationChannel {
  readonly kind: 'in_app' | 'push' | 'manual' | 'email' | 'sms';
  isEnabled(ctx: { associationId?: string }): Promise<boolean>; // config + features
  send(msg: RenderedMessage, recipient: Recipient): Promise<DeliveryResult>;
}
```
| Canal | Lot | Fonctionnement | Fournisseur |
|---|---|---|---|
| `in_app` | 2.5 | Ligne `notifications`, compteur Redis, cloche | Aucun |
| `manual` | 2.3 / 4.3 | Produit un **message prêt** affiché à un humain (codes, relances) ; pas d'envoi | Aucun |
| `push` | 4.2 | Web Push standard (RFC 8030 + VAPID, bibliothèque `web-push`), clés générées par nous | Aucun compte (transport des navigateurs) |
| `email` | 6.1 *(option)* | SMTP (serveur auto-hébergé ou service choisi) | Option |
| `sms` | 6.2 *(option)* | Adaptateur passerelle SMS, repli sur `manual` en cas d'échec | Option |

Un canal désactivé est **ignoré silencieusement** par le routeur ; aucun cas d'usage ne dépend de sa présence. Test d'acceptation (lot 3.5) : toute la boucle V1 passe sans aucun canal externe configuré.

## Matrice par défaut (V1 → V2)
| Événement | Destinataire | In-app | Push (4.2) | Message prêt | Lien d'action |
|---|---|---|---|---|---|
| Compte créé | Souscripteur | — | — | ✓ code (gestionnaire) | `/activer` |
| Ajouté à un projet | Souscripteur existant | ✓ | ✓ | — | `/projets/:id` |
| Échéance dans 3 jours | Souscripteur | ✓ | ✓ | — | `/paiements/declarer?projet=:id` |
| Échéance en retard | Souscripteur | ✓ | ✓ | ✓ file « À relancer » (4.3) | `/paiements/declarer?projet=:id` |
| Paiement validé / rejeté | Souscripteur | ✓ | ✓ | — | `/projets/:id` |
| Paiement déclaré | Gestionnaires | ✓ | ✓ | — | `/asso/paiements/:id` |
| Compte activé | Gestionnaires | ✓ | — | — | `/asso/souscripteurs/:uid` |
| Demande de réinitialisation | Gestionnaires / plateforme | ✓ | ✓ | — | `/asso/souscripteurs/reinitialisations` |
| Contrat signé | Gestionnaires | ✓ | — | — | `/asso/projets/:id/contrat` |
| Quota bientôt atteint, facture | Owner | ✓ | — | — | `/asso/abonnement` |
| Nouvelle demande de création | Plateforme | ✓ | ✓ | — | `/plateforme/demandes/:id` |

- `notifications.action_url` contient la route front exacte : cliquer ouvre l'écran d'action.
- Regroupement : plus de 5 paiements déclarés en 1 h pour une association → une notification récapitulative.
- Heures calmes pour le push non urgent : 21 h – 8 h heure de l'association (mis en attente, pas perdu).
- Temps réel : SSE `GET /me/notifications/stream`, Redis Pub/Sub entre réplicas, reprise `Last-Event-ID`. Avant le lot 4.2 : interrogation toutes les 30 s.
- Push : abonnement désactivé après réponse 404/410 ou 5 échecs.
