# ADR 0004 · Montants en entiers

**Statut :** adopté · 2026-09-29

## Décision

`bigint` en base, entier en JSON, devise ISO à côté.

## Pourquoi

Aucune erreur d'arrondi ; le franc CFA n'a pas de subdivision.

## Alternatives écartées

`numeric` ; flottants.
