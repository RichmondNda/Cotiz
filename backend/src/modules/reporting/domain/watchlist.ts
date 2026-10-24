import { todayIn } from '@cotiz/domain';
import { TIMEZONE } from '../../../shared/scheduler/index.js';

export type WatchSignal = 'unpaid' | 'inactive' | 'quota';

export interface WatchCandidate {
  associationId: string;
  name: string;
  status: 'onboarding' | 'active' | 'past_due' | 'suspended' | 'closed';
  createdAt: Date;
  /** Dernière session d'un de ses gestionnaires ; `null` : aucune. */
  lastActivityAt: Date | null;
  /** Abonnement en cours ; `null` : aucun. */
  subscription: { status: 'trialing' | 'active' | 'past_due'; currentPeriodEnd: string | null } | null;
  usage: { subscribers: number; managers: number };
  /** Limites de l'abonnement en cours ; `null` : illimité. */
  limits: { subscribers: number | null; managers: number | null } | null;
}

export interface WatchEntry {
  associationId: string;
  name: string;
  signal: WatchSignal;
  since: string | null;
}

export const WATCHLIST_LIMIT = 10;
const INACTIVE_AFTER_MS = 30 * 86_400_000;
/** Proche du quota : 80 % de la limite ou plus. */
const QUOTA_PERCENT = 80;
const SEVERITY: Record<WatchSignal, number> = { unpaid: 0, inactive: 1, quota: 2 };

const day = (at: Date) => todayIn(TIMEZONE, at);

function nearLimit(used: number, limit: number | null): boolean {
  return limit !== null && limit > 0 && used * 100 >= limit * QUOTA_PERCENT;
}

/** Signal le plus grave d'une association, `null` si rien à surveiller. */
function signalOf(c: WatchCandidate, now: Date): Omit<WatchEntry, 'associationId' | 'name'> | null {
  // Suspendue ou fermée : déjà traitée par la plateforme.
  if (c.status === 'suspended' || c.status === 'closed') return null;
  if (c.subscription?.status === 'past_due') return { signal: 'unpaid', since: c.subscription.currentPeriodEnd };
  const threshold = now.getTime() - INACTIVE_AFTER_MS;
  const idle = (c.lastActivityAt ?? c.createdAt).getTime() < threshold;
  if (idle) return { signal: 'inactive', since: day(c.lastActivityAt ?? c.createdAt) };
  if (c.status === 'onboarding' && c.createdAt.getTime() < threshold) {
    return { signal: 'inactive', since: day(c.createdAt) };
  }
  if (
    c.limits &&
    (nearLimit(c.usage.subscribers, c.limits.subscribers) || nearLimit(c.usage.managers, c.limits.managers))
  ) {
    return { signal: 'quota', since: null };
  }
  return null;
}

/**
 * Associations à surveiller (tableau de bord plateforme, docs/ui sa-dashboard) : impayées (abonnement `past_due`,
 * depuis la fin de sa période), inactives (aucune session de gestionnaire depuis 30 jours, ou onboarding non terminé
 * 30 jours après la création) ou proches de leurs quotas (souscripteurs ou gestionnaires ≥ 80 %). Un signal par
 * association, le plus grave ; tri par gravité, puis la plus ancienne, puis le nom ; au plus 10.
 */
export function watchlist(candidates: readonly WatchCandidate[], now: Date): WatchEntry[] {
  return candidates
    .flatMap((c) => {
      const signal = signalOf(c, now);
      return signal ? [{ associationId: c.associationId, name: c.name, ...signal }] : [];
    })
    .sort(
      (a, b) =>
        SEVERITY[a.signal] - SEVERITY[b.signal] ||
        (a.since ?? '9999-12-31').localeCompare(b.since ?? '9999-12-31') ||
        a.name.localeCompare(b.name, 'fr'),
    )
    .slice(0, WATCHLIST_LIMIT);
}
