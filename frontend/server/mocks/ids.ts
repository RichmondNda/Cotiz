// Identifiants des mocks : UUID déterministes (version 5, SHA-1) dérivés d'un type et d'une clé lisible.
// Le même slug donne toujours le même UUID : routes, scripts de capture et parcours e2e les retrouvent par `uid()`.
// Utilisable côté serveur Nitro et depuis les scripts Node (aucune dépendance à Nuxt).
import { createHash } from 'node:crypto'

export type IdKind
  = | 'association' | 'plan' | 'user' | 'project' | 'enrollment' | 'installment' | 'payment' | 'payment-method'
    | 'request' | 'notification' | 'contract' | 'invoice' | 'subscription' | 'reminder-rule' | 'reminder-run'
    | 'activation-code' | 'file' | 'import' | 'import-row'

export function uid(kind: IdKind, key: string): string {
  const h = createHash('sha1').update(`cotiz:${kind}:${key}`).digest()
  h[6] = (h[6]! & 0x0F) | 0x50
  h[8] = (h[8]! & 0x3F) | 0x80
  const x = h.subarray(0, 16).toString('hex')
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`
}

// Raccourcis des identifiants les plus utilisés (scripts de capture, parcours e2e, tests).
export const ID = {
  entraide: uid('association', 'entraide-yopougon'),
  man: uid('association', 'ressortissants-man'),
  bouake: uid('association', 'jeunesse-bouake'),
  centre: uid('project', 'centre-communautaire'),
  tontine: uid('project', 'tontine-solidaire-2027'),
  voyage: uid('project', 'voyage-solidaire'),
  mutuelle: uid('project', 'mutuelle-sante'),
  moussa: uid('user', 'moussa-diarra'),
  awa: uid('user', 'awa-kone'),
  aminata: uid('user', 'aminata-konate'),
  richy: uid('user', 'richy'),
} as const
