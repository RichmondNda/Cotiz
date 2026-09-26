// Fichiers CSV générés dans le navigateur (exports, modèle d'import). Séparateur « ; » et BOM UTF-8 pour Excel.

type Cellule = string | number | null | undefined

const BOM = '﻿'

export function versCsv(lignes: Cellule[][]): string {
  const cellule = (v: Cellule) => `"${String(v ?? '').replace(/"/g, '""')}"`
  return lignes.map(l => l.map(cellule).join(';')).join('\n')
}

export function telechargerCsv(nomFichier: string, lignes: Cellule[][]) {
  const url = URL.createObjectURL(new Blob([BOM + versCsv(lignes)], { type: 'text/csv;charset=utf-8' }))
  const a = document.createElement('a')
  a.href = url
  a.download = nomFichier
  a.click()
  URL.revokeObjectURL(url)
}
