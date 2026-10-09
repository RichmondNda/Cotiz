// Jeu de référence normatif (docs/specs/seed-reference.yaml), recopié ici pour être importé sans lecture de fichier
// par le serveur Nitro. Un test (tests/unit/mocks-reference.test.ts) vérifie que les deux restent identiques.
// Les échéances ne sont pas listées : elles sont générées par generateSchedule() de @cotiz/domain (mocks/seed.ts).

export const SEED = {
  today: '2026-09-25',
  associations: [
    {
      key: 'entraide-yopougon', name: 'Entraide Yopougon', city: 'Abidjan', plan: 'essentiel', status: 'active',
      timezone: 'Africa/Abidjan', currency: 'XOF',
      paymentMethods: [
        { kind: 'mobile_money', label: 'Orange Money', details: { operator: 'orange', number: '+2250708091011' } },
        { kind: 'bank_transfer', label: 'SGBCI', details: { bank: 'SGBCI', iban: 'CI93 CI00 8011 1234 5678 9012 34' } },
      ],
    },
    { key: 'ressortissants-man', name: 'Association des ressortissants de Man', city: 'Abidjan', plan: 'pro', status: 'past_due' },
    { key: 'jeunesse-bouake', name: 'Jeunesse solidaire de Bouaké', city: 'Bouaké', plan: 'decouverte', status: 'onboarding' },
  ],
  plans: [
    { code: 'decouverte', name: 'Découverte', priceMonthly: 0, maxProjects: 1, maxSubscribers: 20, maxManagers: 1 },
    { code: 'essentiel', name: 'Essentiel', priceMonthly: 10000, maxProjects: 5, maxSubscribers: 100, maxManagers: 2 },
    { code: 'pro', name: 'Pro', priceMonthly: 25000, maxProjects: null, maxSubscribers: 500, maxManagers: 5 },
  ],
  projects: [
    {
      key: 'centre-communautaire', name: 'Centre communautaire', scheduleType: 'fixed', entryFeeAmount: 50000,
      installmentAmount: 25000, frequency: 'monthly', dueDay: 5, startDate: '2026-03-01', endDate: '2027-08-31',
      graceDays: 5, status: 'active',
    },
    {
      key: 'tontine-2027', name: 'Tontine solidaire 2027', scheduleType: 'rolling', installmentAmount: 10000,
      frequency: 'monthly', dueDay: 5, startDate: '2027-01-01', requiredSubscribers: 30, status: 'enrolling',
    },
    {
      key: 'voyage-solidaire', name: 'Voyage solidaire', scheduleType: 'fixed', entryFeeAmount: 50000,
      installmentAmount: 10000, frequency: 'monthly', dueDay: 5, startDate: '2026-06-01', endDate: '2027-05-31',
      status: 'active', contractRequired: true,
    },
    {
      key: 'mutuelle-sante', association: 'ressortissants-man', name: 'Mutuelle santé', scheduleType: 'fixed',
      entryFeeAmount: 20000, installmentAmount: 10000, frequency: 'monthly', dueDay: 5, startDate: '2026-07-01',
      endDate: '2027-04-30', graceDays: 5, status: 'active',
    },
  ],
  people: [
    { key: 'awa', firstName: 'Awa', lastName: 'Koné', phone: '+2250708091011', email: 'awa@entraide.ci', roles: ['entraide-yopougon:owner'] },
    { key: 'aminata', firstName: 'Aminata', lastName: 'Konaté', email: 'aminata.konate@entraide-yopougon.ci', roles: ['entraide-yopougon:manager'] },
    { key: 'moussa', firstName: 'Moussa', lastName: 'Diarra', phone: '+2250544218790', roles: ['entraide-yopougon:subscriber', 'ressortissants-man:subscriber'] },
    { key: 'fatou', firstName: 'Fatou', lastName: 'Traoré', phone: '+2250122334455', roles: ['entraide-yopougon:subscriber'] },
    { key: 'jean', firstName: 'Jean', lastName: 'Kouassi', phone: '+2250755667788', roles: ['entraide-yopougon:subscriber'] },
    { key: 'richy', firstName: 'Richy', email: 'richy@cotiz.app', roles: ['platform:owner'] },
  ],
  expected: {
    managerDashboard: {
      collectedThisMonth: 1240000, expectedThisMonth: 1300000, paymentsToReview: 6, oldestPendingDays: 3,
      lateSubscribers: 14, totalSubscribers: 52, recoveryRate: 0.82,
    },
    subscriberDashboard_moussa: {
      remainingTotal: 395000, projects: 3, associations: 2, lateAmount: 50000,
      nextDue: { amount: 25000, date: '2026-10-05' },
    },
  },
} as const
