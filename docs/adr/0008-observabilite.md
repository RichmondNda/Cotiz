# ADR 0008 · Observabilité sur la stack ELK existante

**Statut :** adopté · 2026-09-29

## Décision

pino → ELK ; Prometheus + Grafana ; OpenTelemetry → Tempo ; GlitchTip ; Uptime Kuma ; alertes vers ntfy auto-hébergé.

## Pourquoi

Réutilise l'existant sur Dokploy, tout auto-hébergé.

## Alternatives écartées

Services SaaS d'observabilité.
