// Méthode + chemin d'une requête `/api/v1/...` → id d'endpoint et opération du registre de @cotiz/contracts.
// À chemin égal, le segment fixe l'emporte sur le paramètre (`/projects/schedule-preview` avant `/projects/{pid}`).
import { ENDPOINTS } from '@cotiz/contracts'
import type { EndpointId } from '@cotiz/contracts'

interface Route { id: EndpointId, op: string, method: string, segments: string[], params: number }

const ROUTES: Route[] = Object.values(ENDPOINTS)
  .flatMap(def => Object.entries(def.operations).map(([op, o]) => {
    const segments = o.path.split('/').filter(Boolean)
    return { id: def.id as EndpointId, op, method: o.method, segments, params: segments.filter(s => s.startsWith('{')).length }
  }))
  .sort((a, b) => a.params - b.params)

export function resolveEndpoint(method: string, path: string): { id: EndpointId, op: string } | null {
  const parts = path.split('?')[0]!.split('/').filter(Boolean)
  const m = method.toUpperCase()
  for (const r of ROUTES) {
    if (r.method !== m || r.segments.length !== parts.length) continue
    if (r.segments.every((s, i) => s.startsWith('{') ? parts[i] !== '' : s === parts[i])) return { id: r.id, op: r.op }
  }
  return null
}
