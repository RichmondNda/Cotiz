/**
 * URL d'abonnement Web Push acceptable : fournie par le navigateur, puis appelée par le worker. Seuls les services de
 * push connus (suffixe d'hôte de `WEB_PUSH_HOSTS`), en https, sans identifiants dans l'URL. Écarte toute adresse
 * interne (base, Redis, MinIO, métadonnées du serveur).
 */
export interface PushEndpointPolicy {
  hosts: readonly string[];
}

export function pushEndpointPolicy(config: { WEB_PUSH_HOSTS: string }): PushEndpointPolicy {
  return {
    hosts: config.WEB_PUSH_HOSTS.split(',')
      .map((h) => h.trim().toLowerCase())
      .filter((h) => h.length > 0),
  };
}

export function isAllowedPushEndpoint(endpoint: string, policy: PushEndpointPolicy): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  if (url.username !== '' || url.password !== '') return false;
  const host = url.hostname.toLowerCase();
  return policy.hosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}
