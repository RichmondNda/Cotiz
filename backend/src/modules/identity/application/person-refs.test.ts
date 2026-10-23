import { describe, expect, it, vi } from 'vitest';

const context = vi.hoisted((): { space: string | null } => ({ space: 'association' }));
const select = vi.hoisted(() => vi.fn());

vi.mock('../../../shared/tenant-context/index.js', () => ({
  currentContext: () => (context.space ? { space: context.space } : null),
  currentTx: () => ({ select }),
}));

const { platformPersonRefsOf } = await import('./person-refs.js');

describe('platformPersonRefsOf', () => {
  it.each(['association', 'me', 'auth', null])(
    'refusé hors de l’espace plateforme (%s), sans lecture',
    async (space) => {
      context.space = space;
      await expect(platformPersonRefsOf(['00000000-0000-7000-8000-0000000014a1'])).rejects.toThrow(/plateforme/);
      expect(select).not.toHaveBeenCalled();
    },
  );

  it('plateforme : liste vide servie sans lecture', async () => {
    context.space = 'platform';
    await expect(platformPersonRefsOf([])).resolves.toEqual(new Map());
    expect(select).not.toHaveBeenCalled();
  });
});
