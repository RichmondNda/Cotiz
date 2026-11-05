/**
 * Souscripteurs de démonstration d'Entraide Yopougon (décision 21 : « le seed de démonstration génère de vraies
 * inscriptions ») : avec les personnes nommées de seed-dev, ils donnent au tableau de bord gestionnaire, au
 * 2026-09-25, les chiffres de docs/specs/seed-reference.yaml (`expected.managerDashboard`) :
 *
 * - personnes nommées (mesuré) : 5 souscripteurs dont 2 en retard ; 3 paiements à valider ; septembre : 150 000 F
 *   attendus, 37 500 F reçus ; Centre communautaire : 750 000 F attendus à date, 587 500 F recouvrés ;
 * - complément : 46 souscripteurs du Centre communautaire entrés au début du projet (fonds d'entrée 50 000 F puis
 *   25 000 F de mars à septembre : 225 000 F attendus chacun) et 1 inscrit à la Tontine (rien d'attendu en 2026) ;
 *   - 34 à jour, chaque mois validé le lendemain de l'échéance (septembre : 34 × 25 000 = 850 000 F), dont 3 ont
 *     déclaré octobre d'avance (en attente) ;
 *   - 12 en retard, n'ayant réglé que le fonds d'entrée et tout ou partie de mars : 864 500 F en tout, dont
 *     352 500 F validés en septembre (rattrapages) ;
 * - total : 52 souscripteurs, 14 en retard, 6 paiements à valider, septembre 1 300 000 F attendus et
 *   37 500 + 850 000 + 352 500 = 1 240 000 F reçus, recouvrement (587 500 + 34 × 225 000 + 864 500) / (750 000 +
 *   46 × 225 000) = 9 102 000 / 11 100 000 = 82 %.
 *
 * Vérifié par test/integration/reporting-seed-reference.test.ts (horloge au 2026-09-25).
 */

export interface CrowdPayment {
  /** Clé du paiement (`mockId('payment', clé)`). */
  key: string;
  amount: number;
  /** Heure d'Abidjan (UTC), `YYYY-MM-DDTHH:MM`. */
  declared: string;
  /** [rang de l'échéance, montant], dans l'ordre des échéances. */
  covers: readonly (readonly [number, number])[];
  /** Validé à cette heure (relu par la trésorière) ; sinon en attente. */
  reviewedAt?: string;
}

export interface CrowdMember {
  /** Clé de la personne (`mockId('user', clé)`). */
  key: string;
  firstName: string;
  lastName: string;
  phone: string;
  association: 'entraide-yopougon';
  project: 'centre-communautaire' | 'tontine-2027';
  /** Date d'inscription (et d'appartenance). */
  joined: string;
  payments: readonly CrowdPayment[];
}

const FIRST_NAMES = [
  'Adama',
  'Aïcha',
  'Bakary',
  'Clarisse',
  'Daouda',
  'Estelle',
  'Fanta',
  'Gédéon',
  'Habiba',
  'Issouf',
  'Juliette',
  'Karim',
  'Lassina',
  'Mariam',
  'Nafissatou',
  'Ousmane',
  'Pélagie',
  'Rokia',
  'Salif',
  'Tiémoko',
  'Victorine',
  'Yacouba',
  'Zénab',
  'Arsène',
] as const;
const LAST_NAMES = [
  'Bamba',
  'Coulibaly',
  'Dembélé',
  'Diabaté',
  'Fofana',
  'Gnagne',
  'Kaboré',
  'Koffi',
  'Ouattara',
  'Sangaré',
  'Soro',
  'Yao',
  'Zadi',
  'Bakayoko',
  'Cissé',
  'Doumbia',
  'Kanga',
  'Méité',
  'Néya',
  'Tanoh',
] as const;

/** Relectrice des paiements de démonstration : la trésorière d'Entraide. */
export const CROWD_REVIEWER = 'awa-kone';

const pad = (n: number) => String(n).padStart(2, '0');

/** Fonds d'entrée et mars, puis avril à septembre, chacun validé le lendemain de l'échéance du 5. */
function upToDate(key: string, i: number): CrowdPayment[] {
  const minute = pad(i % 60);
  return [
    {
      key: `${key}-03`,
      amount: 75000,
      declared: `2026-03-05T08:${minute}`,
      covers: [
        [0, 50000],
        [1, 25000],
      ],
      reviewedAt: `2026-03-06T09:${minute}`,
    },
    ...[4, 5, 6, 7, 8, 9].map((month, k) => ({
      key: `${key}-${pad(month)}`,
      amount: 25000,
      declared: `2026-${pad(month)}-05T08:${minute}`,
      covers: [[k + 2, 25000]] as const,
      reviewedAt: `2026-${pad(month)}-06T09:${minute}`,
    })),
  ];
}

/** Octobre déclaré d'avance, en attente de validation (après la plus ancienne déclaration nommée, le 22). */
const ADVANCE_DECLARATIONS = ['2026-09-23T09:10', '2026-09-24T11:20', '2026-09-25T08:30'] as const;

/** Retards : ce qu'ils ont réglé (fonds d'entrée, puis mars en tout ou partie) et quand cela a été validé. */
const LATE_PAYMENTS: readonly { march: number; declared: string; reviewedAt: string }[] = [
  ...Array.from({ length: 6 }, () => ({ march: 25000, declared: '2026-03-05T08:00', reviewedAt: '2026-03-06T09:00' })),
  ...Array.from({ length: 4 }, () => ({ march: 25000, declared: '2026-09-07T08:00', reviewedAt: '2026-09-08T09:00' })),
  { march: 12000, declared: '2026-03-05T08:00', reviewedAt: '2026-03-06T09:00' },
  { march: 2500, declared: '2026-09-14T08:00', reviewedAt: '2026-09-15T09:00' },
];

const UP_TO_DATE = 34;

function buildCrowd(): CrowdMember[] {
  const person = (i: number) => ({
    key: `demo-${pad(i + 1)}`,
    firstName: FIRST_NAMES[i % FIRST_NAMES.length] ?? 'Adama',
    lastName: LAST_NAMES[(i * 7) % LAST_NAMES.length] ?? 'Bamba',
    // Plage réservée à la démonstration : jamais un numéro du jeu de référence.
    phone: `+22507990000${pad(i + 1)}`,
    association: 'entraide-yopougon' as const,
  });
  const centre: CrowdMember[] = Array.from({ length: UP_TO_DATE + LATE_PAYMENTS.length }, (_, i) => {
    const p = person(i);
    const late = LATE_PAYMENTS[i - UP_TO_DATE];
    const payments: CrowdPayment[] = late
      ? [
          {
            key: `${p.key}-entree`,
            amount: 50000 + late.march,
            declared: late.declared,
            covers: [
              [0, 50000],
              [1, late.march],
            ],
            reviewedAt: late.reviewedAt,
          },
        ]
      : upToDate(p.key, i);
    const advance = ADVANCE_DECLARATIONS[i];
    if (!late && advance) {
      payments.push({ key: `${p.key}-10`, amount: 25000, declared: advance, covers: [[8, 25000]] });
    }
    return { ...p, project: 'centre-communautaire', joined: '2026-03-01', payments };
  });
  const tontine = person(centre.length);
  return [...centre, { ...tontine, project: 'tontine-2027', joined: '2026-09-10', payments: [] }];
}

export const REFERENCE_CROWD: readonly CrowdMember[] = buildCrowd();
