import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Vecteurs normatifs de docs/specs/test-vectors/, chargés tels quels (tests uniquement).
export interface VectorFile<C> {
  function: string;
  cases: C[];
}

export function loadVectors<C>(name: 'money' | 'schedule' | 'allocation' | 'validation' | 'status'): VectorFile<C> {
  const file = fileURLToPath(new URL(`../../../docs/specs/test-vectors/${name}.json`, import.meta.url));
  return JSON.parse(readFileSync(file, 'utf8')) as VectorFile<C>;
}
