// Données dérivées des séquences de la maquette : échéances (grilles) et paiements.
import type { Echeance, Paiement, Projet, StatutEcheance } from '~~/types'

const CODES: Record<string, StatutEcheance> = { o: 'payee', l: 'en_retard', W: 'declaree', P: 'partielle', f: 'a_venir' }

function ajouterMois(iso: string, n: number): string {
  const [a, m, j] = iso.split('-').map(Number) as [number, number, number]
  const d = new Date(Date.UTC(a, m - 1 + n, j))
  return d.toISOString().slice(0, 10)
}

export function idEcheance(projetId: string, souscripteurId: string, rang: number) {
  return `${projetId}:${souscripteurId}:${rang}`
}

/**
 * Échéances d'un souscripteur sur un projet à dates fixes : rang 0 = fonds d'entrée (à la date de début),
 * puis une échéance par mois à partir de la date de début. Au-delà de la séquence : à venir.
 */
export function genererEcheances(projet: Projet, souscripteurId: string, sequence: string): Echeance[] {
  const nb = projet.nbEcheances ?? 0
  const debut = projet.dateDebut
  if (!/^\d{4}-\d{2}-\d{2}$/.test(debut)) return []
  const lignes: Echeance[] = []
  const total = (projet.fondsEntree ? 1 : 0) + nb
  for (let i = 0; i < total; i++) {
    const estFondsEntree = Boolean(projet.fondsEntree) && i === 0
    const mois = projet.fondsEntree ? Math.max(0, i - 1) : i
    const montant = estFondsEntree ? projet.fondsEntree! : projet.montantEcheance
    const statut = CODES[sequence[i] ?? 'f'] ?? 'a_venir'
    lignes.push({
      id: idEcheance(projet.id, souscripteurId, i),
      projetId: projet.id,
      souscripteurId,
      rang: i,
      estFondsEntree,
      date: ajouterMois(debut, mois),
      montant,
      montantPaye: statut === 'payee' ? montant : statut === 'partielle' ? montant / 2 : 0,
      statut,
    })
  }
  return lignes
}

/** Paiements déclarés en attente (file du gestionnaire, DONNEES-REFERENCE.md). */
export function paiementsEnAttente(): Paiement[] {
  const centre = (s: string, rang: number) => idEcheance('centre-communautaire', s, rang)
  return [
    {
      id: 'pm-awa-kone', souscripteurId: 'awa-kone', projetId: 'centre-communautaire', associationId: 'entraide-yopougon',
      montant: 75000, moyen: 'mobile_money', declareLe: '2026-09-22',
      preuve: { type: 'image', nomFichier: 'capture_virement.jpg', url: '[URL]', reference: 'OM-20260912-4471' },
      repartition: [7, 8, 9].map(r => ({ echeanceId: centre('awa-kone', r), montantAffecte: 25000 })),
      repartitionAjustee: false, statut: 'en_attente',
    },
    {
      id: 'pm-jean-kouassi', souscripteurId: 'jean-kouassi', projetId: 'centre-communautaire', associationId: 'entraide-yopougon',
      montant: 12500, moyen: 'mobile_money', declareLe: '2026-09-23',
      preuve: { type: 'reference', reference: '[RÉFÉRENCE]' },
      repartition: [{ echeanceId: centre('jean-kouassi', 6), montantAffecte: 12500 }],
      repartitionAjustee: false, statut: 'en_attente',
    },
    {
      id: 'pm-kadiatou-sanogo', souscripteurId: 'kadiatou-sanogo', projetId: 'centre-communautaire', associationId: 'entraide-yopougon',
      montant: 25000, moyen: 'virement', declareLe: '2026-09-23',
      preuve: { type: 'pdf', nomFichier: 'recu_banque.pdf', url: '[URL]' },
      repartition: [{ echeanceId: centre('kadiatou-sanogo', 7), montantAffecte: 25000 }],
      repartitionAjustee: false, statut: 'en_attente',
    },
    {
      id: 'pm-serge-gnagne', souscripteurId: 'serge-gnagne', projetId: 'centre-communautaire', associationId: 'entraide-yopougon',
      montant: 25000, moyen: 'mobile_money', declareLe: '2026-09-24',
      preuve: { type: 'image', nomFichier: '[FICHIER]', url: '[URL]' },
      repartition: [{ echeanceId: centre('serge-gnagne', 7), montantAffecte: 25000 }],
      repartitionAjustee: false, statut: 'en_attente',
    },
    {
      // Voyage solidaire : pas de calendrier précis dans la maquette, l'échéance est désignée par son mois.
      id: 'pm-ibrahim-toure', souscripteurId: 'ibrahim-toure', projetId: 'voyage-solidaire', associationId: 'entraide-yopougon',
      montant: 10000, moyen: 'mobile_money', declareLe: '2026-09-24',
      preuve: { type: 'image', nomFichier: '[FICHIER]', url: '[URL]' },
      repartition: [{ echeanceId: 'voyage-solidaire:ibrahim-toure:septembre-2026', montantAffecte: 10000 }],
      repartitionAjustee: false, statut: 'en_attente',
    },
    {
      id: 'pm-adjoua-yao', souscripteurId: 'adjoua-yao', projetId: 'voyage-solidaire', associationId: 'entraide-yopougon',
      montant: 50000, moyen: 'virement', declareLe: '2026-09-25',
      preuve: { type: 'image', nomFichier: '[FICHIER]', url: '[URL]' },
      repartition: [{ echeanceId: 'voyage-solidaire:adjoua-yao:fonds-entree', montantAffecte: 50000 }],
      repartitionAjustee: false, statut: 'en_attente',
    },
  ]
}

/** Paiements validés de Moussa Diarra (MbHistorique). */
export function paiementsMoussa(): Paiement[] {
  const P = (id: string, projetId: string, associationId: string, montant: number, declareLe: string, traiteLe: string, rangs: [number, number][]): Paiement => ({
    id, souscripteurId: 'moussa-diarra', projetId, associationId, montant, moyen: 'mobile_money', declareLe, traiteLe,
    preuve: { type: 'reference', reference: '[RÉFÉRENCE]' },
    repartition: rangs.map(([rang, m]) => ({ echeanceId: idEcheance(projetId, 'moussa-diarra', rang), montantAffecte: m })),
    repartitionAjustee: false, statut: 'valide',
  })
  const C = ['centre-communautaire', 'entraide-yopougon'] as const
  const M = ['mutuelle-sante', 'ressortissants-man'] as const
  return [
    P('pm-md-09-m', ...M, 10000, '2026-09-05', '2026-09-06', [[3, 10000]]),
    P('pm-md-08-m', ...M, 10000, '2026-08-05', '2026-08-06', [[2, 10000]]),
    P('pm-md-07-c', ...C, 25000, '2026-07-05', '2026-07-07', [[5, 25000]]),
    P('pm-md-07-m', ...M, 30000, '2026-07-05', '2026-07-06', [[0, 20000], [1, 10000]]),
    P('pm-md-06-c', ...C, 25000, '2026-06-05', '2026-06-06', [[4, 25000]]),
    P('pm-md-05-c', ...C, 25000, '2026-05-05', '2026-05-06', [[3, 25000]]),
    P('pm-md-04-c', ...C, 25000, '2026-04-05', '2026-04-07', [[2, 25000]]),
    P('pm-md-03-c', ...C, 75000, '2026-03-05', '2026-03-06', [[0, 50000], [1, 25000]]),
  ]
}
