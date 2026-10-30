import { describe, expect, it } from 'vitest';
import { canRevert, revertDeadline } from './index.js';

const reviewedAt = new Date('2026-11-08T10:00:00.000Z');
const validated = { status: 'validated', reviewedAt, reviewedBy: 'awa' };
const at = (iso: string) => new Date(iso);

describe('annulation d’une validation (≤ 10 min, auteur)', () => {
  it('échéance : 10 min après la validation ; aucune si le paiement n’est pas validé', () => {
    expect(revertDeadline(validated)?.toISOString()).toBe('2026-11-08T10:10:00.000Z');
    expect(revertDeadline({ ...validated, status: 'rejected' })).toBeNull();
    expect(revertDeadline({ status: 'pending', reviewedAt: null, reviewedBy: null })).toBeNull();
  });

  it('borne incluse : annulable à 10 min pile, plus une milliseconde après', () => {
    expect(canRevert(validated, 'awa', at('2026-11-08T10:10:00.000Z'))).toBe(true);
    expect(canRevert(validated, 'awa', at('2026-11-08T10:10:00.001Z'))).toBe(false);
  });

  it('par l’auteur seulement, et seulement un paiement validé', () => {
    expect(canRevert(validated, 'aminata', at('2026-11-08T10:01:00.000Z'))).toBe(false);
    expect(canRevert({ ...validated, status: 'rejected' }, 'awa', at('2026-11-08T10:01:00.000Z'))).toBe(false);
  });
});
