# ADR 0006 · Stockage objet S3 (MinIO)

**Statut :** adopté · 2026-09-29

## Décision

Tous les fichiers dans des compartiments privés, servis par URL signée courte ; compartiment WORM pour le juridique.

## Pourquoi

Auto-hébergé sur le VPS ; migration vers un S3 géré par simple configuration.

## Alternatives écartées

Fichiers en base ; disque local.
