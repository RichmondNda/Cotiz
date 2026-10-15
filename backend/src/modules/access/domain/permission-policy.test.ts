import { PERMISSIONS } from '@cotiz/contracts';
import { describe, expect, it } from 'vitest';
import { holdsPermission } from './permission-policy.js';

describe('holdsPermission (docs/specs/permissions.yaml)', () => {
  it('public : tout le monde, même anonyme', () => {
    expect(holdsPermission('public', null)).toBe(true);
    expect(holdsPermission('public', { role: null })).toBe(true);
  });

  it('authenticated : toute personne connectée, rôle connu ou non', () => {
    expect(holdsPermission('authenticated', null)).toBe(false);
    expect(holdsPermission('authenticated', { role: null })).toBe(true);
    expect(holdsPermission('authenticated', { role: 'platform:support' })).toBe(true);
  });

  it('permission de rôle : seulement les rôles listés', () => {
    expect(holdsPermission('payments.review', { role: 'association:manager' })).toBe(true);
    expect(holdsPermission('payments.review', { role: 'association:viewer' })).toBe(false);
    expect(holdsPermission('platform.staff.manage', { role: 'platform:owner' })).toBe(true);
    expect(holdsPermission('platform.staff.manage', { role: 'platform:admin' })).toBe(false);
    expect(holdsPermission('subscriber.self', { role: 'subscriber' })).toBe(true);
    expect(holdsPermission('subscriber.self', { role: 'association:owner' })).toBe(false);
  });

  it('rôle inconnu (non résolu) ou anonyme : aucune permission de rôle', () => {
    for (const permission of PERMISSIONS.filter((p) => p !== 'public' && p !== 'authenticated')) {
      expect(holdsPermission(permission, { role: null })).toBe(false);
      expect(holdsPermission(permission, null)).toBe(false);
    }
  });

  it('un rôle d’un espace ne vaut rien dans un autre (owner plateforme ≠ owner d’association)', () => {
    expect(holdsPermission('association.settings.manage', { role: 'platform:owner' })).toBe(false);
    expect(holdsPermission('platform.associations.manage', { role: 'association:owner' })).toBe(false);
  });
});
