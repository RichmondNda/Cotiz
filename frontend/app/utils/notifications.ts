// Présentation des notifications (souscripteur et gestionnaire) : groupes par période et moment affiché.
import type { Notification } from '~~/types'
import { formatDate, formatJourSemaine, joursDepuis, lireDate } from './format'

const estDatee = (n: Notification) => /^\d{4}-/.test(n.creeeLe)

/** Groupes Aujourd'hui · Cette semaine · Plus ancien (plus récentes d'abord, placeholders `[DATE]` en dernier). */
export function grouperNotifications(liste: Notification[]): { titre: string, notifications: Notification[] }[] {
  const triees = [...liste].sort((a, b) => b.creeeLe.localeCompare(a.creeeLe))
  const g = [
    { titre: 'Aujourd’hui', notifications: [] as Notification[] },
    { titre: 'Cette semaine', notifications: [] as Notification[] },
    { titre: 'Plus ancien', notifications: [] as Notification[] },
  ]
  for (const n of triees) {
    const jours = estDatee(n) ? joursDepuis(n.creeeLe) : Number.POSITIVE_INFINITY
    g[jours <= 0 ? 0 : jours <= 6 ? 1 : 2]!.notifications.push(n)
  }
  return g.filter(x => x.notifications.length)
}

/** Heure (aujourd'hui), jour de la semaine (cette semaine), sinon JJ/MM. */
export function momentNotification(n: Notification): string {
  if (!estDatee(n)) return n.creeeLe
  const jours = joursDepuis(n.creeeLe)
  if (jours <= 0) {
    const d = lireDate(n.creeeLe)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  if (jours <= 6) return formatJourSemaine(n.creeeLe)
  return formatDate(n.creeeLe, 'numerique').slice(0, 5)
}
