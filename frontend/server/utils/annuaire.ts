// Vues gestionnaire des souscripteurs de l'association (annuaire, fiche), calculées depuis le store en mémoire
// (auto-importées par Nitro).
import type { EvenementSouscripteur, FicheSouscripteur, Souscripteur, Souscription, StatutSouscription } from '~~/types'
import { formatFCFA, formatMois } from '../../app/utils/format'
import { libelleCouverture } from '../../app/utils/echeances'
import { store } from '../mocks/store'

const GRAVITE: Record<StatutSouscription, number> = { en_retard: 2, signature_attendue: 1, a_jour: 0 }
const estDate = (d?: string) => Boolean(d && /^\d{4}-\d{2}-\d{2}/.test(d))
const numerique = (d: string) => (estDate(d) ? d.slice(0, 10).split('-').reverse().join('/') : d)

/** Coordonnées vues par l'association : celles du souscripteur, complétées des placeholders de la maquette. */
export function souscripteurAssociation(s: Souscripteur): Souscripteur {
  return { ...s, ...store.coordonneesAssociation[s.id] }
}

/** Souscriptions du souscripteur aux projets de l'association. */
export function souscriptionsAssociation(souscripteurId: string, associationId: string): Souscription[] {
  const projets = new Set(store.projets.filter(p => p.associationId === associationId).map(p => p.id))
  return store.souscriptions.filter(x => x.souscripteurId === souscripteurId && projets.has(x.projetId))
}

/**
 * Statut global : le pire de ses projets engagés (une signature attendue sur un 2e projet ne masque pas un
 * projet en cours) ; seulement en attente de signature s'il n'est engagé nulle part.
 */
export function statutGlobal(liste: Souscription[]): StatutSouscription {
  const engages = liste.filter(x => x.statut !== 'signature_attendue')
  const base = engages.length ? engages : liste
  return base.reduce<StatutSouscription>((pire, x) => (GRAVITE[x.statut] > GRAVITE[pire] ? x.statut : pire), 'a_jour')
}

/** Frise d'historique du souscripteur sur les projets de l'association, plus récent d'abord. */
function historique(souscripteurId: string, liste: Souscription[]): EvenementSouscripteur[] {
  const evenements: EvenementSouscripteur[] = []
  const projets = new Map(store.projets.map(p => [p.id, p]))
  const gestionnaire = (id?: string) => {
    const g = id ? store.gestionnaires.find(x => x.id === id) : undefined
    return g ? `${g.prenom} ${g.nom}` : undefined
  }

  for (const sc of liste) {
    const projet = projets.get(sc.projetId)
    if (!projet) continue
    const echeances = store.echeances.filter(e => e.projetId === sc.projetId && e.souscripteurId === souscripteurId)

    // Paiements déclarés, validés, rejetés.
    for (const p of store.paiements.filter(x => x.projetId === sc.projetId && x.souscripteurId === souscripteurId)) {
      const couvertes = echeances.filter(e => p.repartition.some(r => r.echeanceId === e.id))
      const mois = couvertes.length ? libelleCouverture(couvertes) : ''
      if (p.statut === 'en_attente') {
        evenements.push({ id: `${p.id}-declare`, date: p.declareLe, titre: `Paiement déclaré — ${formatFCFA(p.montant)}`, detail: [numerique(p.declareLe), mois, 'en attente'].filter(Boolean).join(' · '), ton: 'warning' })
      }
      else if (p.statut === 'valide') {
        const date = p.traiteLe ?? p.declareLe
        evenements.push({ id: `${p.id}-valide`, date, titre: `Paiement validé — ${formatFCFA(p.montantRecu ?? p.montant)}`, detail: [numerique(p.declareLe), mois, gestionnaire(p.traitePar) && `par ${gestionnaire(p.traitePar)}`].filter(Boolean).join(' · '), ton: 'success' })
      }
      else {
        evenements.push({ id: `${p.id}-rejete`, date: p.traiteLe ?? p.declareLe, titre: `Paiement rejeté — ${formatFCFA(p.montant)}`, detail: [numerique(p.declareLe), mois].filter(Boolean).join(' · '), ton: 'danger' })
      }
    }

    // Échéances en retard, avec la relance envoyée.
    for (const e of echeances.filter(x => x.statut === 'en_retard')) {
      const relance = store.relancesEcheances.find(r => r.souscripteurId === souscripteurId && r.projetId === sc.projetId && r.rang === e.rang)
      const mois = formatMois(e.date, 'seul').toLowerCase()
      evenements.push({
        id: `${e.id}-retard`,
        date: relance?.date ?? e.date,
        titre: `Échéance ${/^[aeiouéè]/i.test(mois) ? 'd’' : 'de '}${mois} en retard`,
        detail: [numerique(relance?.date ?? e.date), relance?.detail].filter(Boolean).join(' · '),
        ton: 'danger',
      })
    }

    // Contrat et inscription.
    const contrat = store.contrats.find(c => c.projetId === sc.projetId && c.souscripteurId === souscripteurId)
    if (sc.contratSigneLe) {
      evenements.push({ id: `${sc.id}-signe`, date: sc.contratSigneLe, titre: `Contrat ${projet.nom} signé`, detail: numerique(sc.contratSigneLe), ton: 'success' })
    }
    else {
      const envoye = contrat?.envoyeLe ?? sc.inscritLe
      evenements.push({ id: `${sc.id}-envoye`, date: envoye, titre: `Contrat ${projet.nom} envoyé`, detail: `${numerique(envoye)} · en attente de signature`, ton: 'warning' })
      evenements.push({ id: `${sc.id}-inscrit`, date: sc.inscritLe, titre: `Inscription au projet ${projet.nom}`, detail: numerique(sc.inscritLe), ton: 'info' })
    }
  }

  // Plus récent d'abord ; les placeholders `[DATE]` en fin de frise.
  return evenements.sort((a, b) => (estDate(b.date) ? b.date : '').localeCompare(estDate(a.date) ? a.date : ''))
}

export function ficheSouscripteur(s: Souscripteur, associationId: string): FicheSouscripteur {
  const liste = souscriptionsAssociation(s.id, associationId)
  const datees = liste.map(x => x.inscritLe).filter(estDate).sort()
  return {
    souscripteur: souscripteurAssociation(s),
    souscriptions: liste.map(x => ({
      ...x,
      projet: store.projets.find(p => p.id === x.projetId)!,
      echeances: store.echeances.filter(e => e.projetId === x.projetId && e.souscripteurId === s.id).sort((a, b) => a.rang - b.rang),
    })),
    statutGlobal: statutGlobal(liste),
    membreDepuis: datees[0] ?? s.membreDepuis,
    historique: historique(s.id, liste),
  }
}
