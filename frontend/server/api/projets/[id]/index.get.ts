// GET /api/projets/:id — détail. Scénarios (détail gestionnaire) : `aucun-retard`, `termine`.
export default defineMockHandler((event, scenario) => projetGestionnaire(parametre(event, 'id'), scenario))
