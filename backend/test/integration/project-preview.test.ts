import { SchedulePreview } from '@cotiz/contracts';
import { generateSchedule, type ScheduleLine } from '@cotiz/domain';
import fc from 'fast-check';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { A, B } from '../isolation/harness.js';
import { FIXED, type ProjectsFixture, startProjectsFixture, xof } from './projects.fixture.js';

/**
 * Lot 2.2 · étape 2, vérification : aperçu d'échéancier identique côté front et côté back, sur 1 000 projets
 * aléatoires (fast-check). Le back (pr.preview) et l'aperçu du front (frontend/app/utils/echeancier.ts : lignes, nombre
 * d'échéances, total par souscripteur) appellent tous deux generateSchedule() de @cotiz/domain ; ce test compare leurs
 * sorties, conditions invalides comprises (422 côté back, aucune ligne côté front).
 */

type Frequence = 'hebdomadaire' | 'mensuelle' | 'trimestrielle' | 'semestrielle' | 'annuelle';

/** Termes saisis par l'interface (TermesEcheancier du front). */
interface Termes {
  fondsEntree: number | null;
  montantEcheance: number;
  frequence: Frequence;
  jourEcheance?: number;
  typeCalendrier: 'dates_fixes' | 'cycle_roulant';
  dateDebut: string;
  dateFin?: string | null;
  horizon?: number | null;
}

/** Aperçu du front, chargé tel que Nuxt le sert (ses imports de types sont effacés). */
interface FrontApercu {
  lignesEcheancier(t: Termes): ScheduleLine[];
  nbEcheances(t: Termes): number | null;
  totalParSouscripteur(t: Termes): number | null;
}
const FRONT = new URL('../../../frontend/app/utils/echeancier.ts', import.meta.url).href;

const FREQUENCES: Record<string, Frequence> = {
  weekly: 'hebdomadaire',
  monthly: 'mensuelle',
  quarterly: 'trimestrielle',
  semiannual: 'semestrielle',
  annual: 'annuelle',
};

const day = fc
  .date({ min: new Date('2024-01-01T00:00:00Z'), max: new Date('2029-12-31T00:00:00Z'), noInvalidDate: true })
  .map((d) => d.toISOString().slice(0, 10));

/** Conditions d'un projet, valides ou non (jour hors bornes, fin absente ou avant le début). */
const terms = fc.record({
  entryFee: fc.option(fc.integer({ min: 0, max: 500_000 }), { nil: null }),
  installmentAmount: fc.integer({ min: 1, max: 1_000_000 }),
  frequency: fc.constantFrom('weekly', 'monthly', 'quarterly', 'semiannual', 'annual'),
  dueDay: fc.integer({ min: 1, max: 31 }),
  scheduleType: fc.constantFrom('fixed', 'rolling'),
  startDate: day,
  endDate: fc.option(day, { nil: null }),
  horizon: fc.option(fc.integer({ min: 1, max: 60 }), { nil: undefined }),
});

describe('aperçu d’échéancier (pr.preview)', () => {
  let f: ProjectsFixture;
  let front: FrontApercu;

  const preview = (body: unknown, token = f.tokens.awa, aid = A.id) =>
    f.call(`/associations/${aid}/projects/schedule-preview`, { token, method: 'POST', body });

  beforeAll(async () => {
    // 1 000 aperçus en quelques secondes : au-delà du débit d'une association.
    f = await startProjectsFixture({ RATE_LIMIT_ASSOCIATION_PER_MIN: '100000' });
    front = (await import(FRONT)) as FrontApercu;
  });

  afterAll(() => f.stop());

  it('identique à l’aperçu du front sur 1 000 projets aléatoires', async () => {
    await fc.assert(
      fc.asyncProperty(terms, async (t) => {
        const body = {
          entryFee: t.entryFee === null ? null : xof(t.entryFee),
          installmentAmount: xof(t.installmentAmount),
          frequency: t.frequency,
          dueDay: t.dueDay,
          scheduleType: t.scheduleType,
          startDate: t.startDate,
          endDate: t.endDate,
          ...(t.horizon === undefined ? {} : { horizon: t.horizon }),
        };
        const termes: Termes = {
          fondsEntree: t.entryFee,
          montantEcheance: t.installmentAmount,
          frequence: FREQUENCES[t.frequency] ?? 'mensuelle',
          jourEcheance: t.dueDay,
          typeCalendrier: t.scheduleType === 'fixed' ? 'dates_fixes' : 'cycle_roulant',
          dateDebut: t.startDate,
          dateFin: t.endDate,
          horizon: t.horizon ?? null,
        };
        const res = await preview(body);
        const lines = front.lignesEcheancier(termes);
        if (res.status === 422) {
          // Refus du domaine (un champ des conditions) ou dates fixes sans échéance ; le front n'a alors aucune ligne.
          const problem = (await res.json()) as { code: string; fields: Record<string, string> };
          expect(problem.code).toBe('validation_failed');
          expect(Object.keys(problem.fields)).toHaveLength(1);
          expect(['dueDay', 'endDate', 'startDate']).toContain(Object.keys(problem.fields)[0]);
          expect(lines).toEqual([]);
          return;
        }
        expect(res.status).toBe(200);
        const back = SchedulePreview.parse(await res.json());
        expect(back.installments).toEqual(lines.map((l) => ({ ...l, amountDue: xof(l.amountDue) })));
        // Le front n'affiche un nombre d'échéances et un total qu'en dates fixes, et rien pour un échéancier vide.
        const periodic = lines.filter((l) => l.kind === 'periodic').length;
        expect(back.periodicCount).toBe(periodic);
        expect(t.scheduleType === 'fixed' && periodic > 0 ? back.periodicCount : null).toBe(front.nbEcheances(termes));
        const total = front.totalParSouscripteur(termes);
        expect(back.totalPerSubscriber).toEqual(
          t.scheduleType === 'fixed' && lines.length > 0 ? xof(total ?? -1) : null,
        );
      }),
      { numRuns: 1000 },
    );
  }, 300_000);

  it('date d’entrée d’un souscripteur : seules les dates suivantes, numéros du projet conservés', async () => {
    const body = { ...FIXED, enrolledFrom: '2026-10-01' };
    const res = await preview(body);
    expect(res.status).toBe(200);
    const expected = generateSchedule({
      installmentAmount: 25000,
      entryFeeAmount: 50000,
      frequency: 'monthly',
      dueDay: 5,
      scheduleType: 'fixed',
      startDate: '2026-03-01',
      endDate: '2027-08-31',
      enrolledFrom: '2026-10-01',
    });
    const back = SchedulePreview.parse(await res.json());
    expect(back.installments).toEqual(expected.map((l) => ({ ...l, amountDue: xof(l.amountDue) })));
    expect(back.installments[1]).toMatchObject({ sequence: 8, dueDate: '2026-10-05' });
    expect(back).toMatchObject({ periodicCount: 11, totalPerSubscriber: xof(50000 + 11 * 25000) });
  });

  it('conditions invalides : 422 validation_failed sur le champ ; devise d’une autre association refusée', async () => {
    const weekly = await preview({ ...FIXED, frequency: 'weekly', dueDay: 8 });
    expect(weekly.status).toBe(422);
    expect(await weekly.json()).toMatchObject({ code: 'validation_failed', fields: { dueDay: 'invalid_due_day' } });
    const empty = await preview({ ...FIXED, startDate: '2026-03-06', endDate: '2026-03-31' });
    expect(empty.status).toBe(422);
    expect(await empty.json()).toMatchObject({ fields: { endDate: 'no_installment' } });
    // Un souscripteur entré après la dernière date : aucune échéance, mais le projet en a.
    const late = await preview({ ...FIXED, enrolledFrom: '2027-09-01' });
    expect(late.status).toBe(200);
    expect(SchedulePreview.parse(await late.json())).toEqual({
      installments: [],
      periodicCount: 0,
      totalPerSubscriber: null,
    });
    const xaf = await preview({ ...FIXED, installmentAmount: { amount: 25000, currency: 'XAF' } });
    expect(xaf.status).toBe(422);
    expect(await xaf.json()).toMatchObject({ fields: { installmentAmount: 'currency_mismatch' } });
  });

  it('total au-delà des entiers sûrs : 200, total null (comme le front) ; association en XAF : montants en XAF', async () => {
    const huge = await preview({ ...FIXED, installmentAmount: xof(1_000_000_000_000_000) });
    expect(huge.status).toBe(200);
    expect(SchedulePreview.parse(await huge.json())).toMatchObject({ periodicCount: 18, totalPerSubscriber: null });
    await f.h.superuser(`UPDATE associations SET currency = 'XAF' WHERE id = $1`, [A.id]);
    try {
      const xaf = (amount: number) => ({ amount, currency: 'XAF' });
      const res = await preview({ ...FIXED, entryFee: xaf(50000), installmentAmount: xaf(25000) });
      expect(res.status).toBe(200);
      const back = SchedulePreview.parse(await res.json());
      expect(new Set(back.installments.map((l) => l.amountDue.currency))).toEqual(new Set(['XAF']));
      expect(back.totalPerSubscriber).toEqual(xaf(500000));
    } finally {
      await f.h.superuser(`UPDATE associations SET currency = 'XOF' WHERE id = $1`, [A.id]);
    }
  });

  it('aucune écriture : ni projet ni événement', async () => {
    await preview(FIXED);
    expect((await f.h.superuser('SELECT 1 FROM projects')).rowCount).toBe(0);
    expect((await f.h.superuser(`SELECT 1 FROM outbox_events WHERE event_type LIKE 'project.%'`)).rowCount).toBe(0);
  });

  it('manager : permis ; viewer : 403 ; autre association ou souscripteur : 404', async () => {
    expect((await preview(FIXED, f.tokens.aminata)).status).toBe(200);
    expect((await preview(FIXED, f.tokens.koffi)).status).toBe(403);
    expect((await preview(FIXED, f.tokens.aminata, B.id)).status).toBe(404);
    expect((await preview(FIXED, f.tokens.moussa)).status).toBe(404);
  });
});
