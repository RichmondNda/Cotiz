// Relances de l'association (lot 4.3) : retardataires (file « À relancer », rm.queue), règles (rm.rules), historique des
// envois (rm.hist), relance ponctuelle (rm.send). Aucun SMS ni email : le message prêt est transmis par une personne.
import type { EnvoiRelance, LigneRetard, RegleRelance, Relances } from '~~/types'
import { associationCourante } from './session'
import { jour, tel } from './vues/communs'

type Regle = { id: string, trigger: string, offsetDays: number, message: string, isActive: boolean }

function vueRegle(r: Regle): RegleRelance {
  const titre = r.trigger === 'before_due' ? `${r.offsetDays} jours avant l’échéance` : r.trigger === 'on_due' ? 'Le jour de l’échéance' : `${r.offsetDays} jours de retard`
  const ton = r.trigger === 'after_due' ? (r.offsetDays > 7 ? 'danger' : 'warning') : 'info'
  return { id: r.id, titre, description: r.message, ton, active: r.isActive }
}

export const useRelances = () =>
  useLecture<Relances>('relances', async (client) => {
    const aid = await associationCourante(client)
    const [file, regles, hist, tdb] = await Promise.all([
      toutesLesPages(cursor => client.call('rm.queue', 'list', { params: { aid }, query: { limit: 100, cursor } })),
      client.call('rm.rules', 'list', { params: { aid } }),
      toutesLesPages(cursor => client.call('rm.hist', 'list', { params: { aid }, query: { limit: 100, cursor } })),
      client.call('as.dashboard', 'get', { params: { aid } }),
    ])
    const derniere = (uid: string) => hist.items.find(h => h.member.id === uid)
    const lignes = new Map<string, LigneRetard>()
    for (const e of file.items) {
      const cle = `${e.member.id}:${e.project.id}`
      const ligne = lignes.get(cle) ?? {
        souscripteurId: e.member.id, nom: `${e.member.firstName} ${e.member.lastName}`.trim(), telephone: tel(e.member.phone),
        projetId: e.project.id, nomProjet: e.project.name, echeances: [], montant: 0, retardDepuis: e.dueDate,
        ...(derniere(e.member.id) ? { derniereRelance: { type: derniere(e.member.id)!.kind === 'automatic' ? 'auto' as const : 'manuelle' as const, date: jour(derniere(e.member.id)!.at) } } : {}),
      }
      ligne.echeances.push({ date: e.dueDate, partielle: false })
      ligne.montant += e.amountDue.amount
      if (e.dueDate < ligne.retardDepuis) ligne.retardDepuis = e.dueDate
      lignes.set(cle, ligne)
    }
    // Historique : un envoi = même instant, même règle (ou même auteur), même projet.
    const envois = new Map<string, EnvoiRelance & { regle?: string }>()
    for (const h of hist.items) {
      const cle = `${h.at}:${h.ruleId ?? h.triggeredBy?.id}:${h.project.id}`
      const regle = regles.items.find(r => r.id === h.ruleId)
      const e = envois.get(cle) ?? {
        id: cle, date: jour(h.at), type: h.kind === 'automatic' ? 'automatique' as const : 'manuelle' as const, projet: h.project.name, destinataires: 0,
        par: h.kind === 'automatic' ? `Cotiz · règle « ${regle ? vueRegle(regle).titre.replace(' de retard', '') : 'automatique'} »` : `${h.triggeredBy?.firstName ?? ''} ${h.triggeredBy?.lastName ?? ''}`.trim(),
        ...(regle ? { regle: vueRegle(regle).titre } : {}),
      }
      e.destinataires = (e.destinataires as number) + 1
      envois.set(cle, e)
    }
    const auto = [...envois.values()].find(e => e.type === 'automatique')
    return {
      retardataires: [...lignes.values()].sort((a, b) => a.retardDepuis.localeCompare(b.retardDepuis) || b.montant - a.montant),
      nbEnRetard: tdb.lateSubscribers.count,
      nbActifs: tdb.lateSubscribers.activeCount,
      montantEnRetard: '[MONTANT]',
      ...(auto ? { derniereAuto: { date: auto.date, regle: auto.regle ?? 'automatique', envois: auto.destinataires as number } } : {}),
      regles: regles.items.map(vueRegle),
      historique: [...envois.values()].map(({ regle: _r, ...e }) => e),
    }
  })

/** Relance ponctuelle d'un ou plusieurs souscripteurs (page Relances, fiche souscripteur). */
export function useEnvoiRelance() {
  const client = useClient()
  return async (corps: { souscripteurIds: string[], projetId?: string, message?: string }) => {
    const r = await client.call('rm.send', 'send', {
      params: { aid: await associationCourante(client) },
      body: { userIds: corps.souscripteurIds, ...(corps.projetId ? { projectId: corps.projetId } : {}), ...(corps.message ? { message: corps.message } : {}) },
    })
    return { envoyees: new Set(r.queued.map(q => q.member.id)).size, canal: 'notification' as const }
  }
}

/** Active ou désactive une règle de relance automatique. */
export function useRegleRelance() {
  const client = useClient()
  return async (id: string, active: boolean) =>
    vueRegle(await client.call('rm.rules', 'patch', { params: { aid: await associationCourante(client), id }, body: { isActive: active } }))
}
