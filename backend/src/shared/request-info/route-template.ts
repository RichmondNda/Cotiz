interface RoutedRequest {
  baseUrl?: string;
  route?: { path?: unknown };
}

/**
 * Route gabarit d'une requête (`/api/v1/files/:id`) pour les journaux et les métriques : jamais l'URL ni la query
 * string, qui peuvent citer un identifiant, un code ou un téléphone. Sans route du contrat (404), Express garde le
 * joker des middlewares (`*path`) : `unmatched`. Lue à la fin de la réponse, une fois le routage fait.
 */
export function routeTemplate(req: RoutedRequest): string {
  const path = typeof req.route?.path === 'string' ? `${req.baseUrl ?? ''}${req.route.path}` : '*';
  return path.includes('*') ? 'unmatched' : path;
}
