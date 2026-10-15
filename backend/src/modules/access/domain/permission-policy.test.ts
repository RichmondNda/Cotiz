import { PERMISSIONS } from '@cotiz/contracts';
import { describe, expect, it } from 'vitest';
import { actorRoleOf, holdsPermission, permissionsOf } from './permission-policy.js';

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

describe('permissionsOf', () => {
  it('owner plateforme : toutes les permissions plateforme, rien des autres espaces', () => {
    const owned = permissionsOf('platform:owner');
    expect(owned).toContain('platform.staff.manage');
    expect(owned).toContain('platform.associations.read');
    expect(owned).toContain('authenticated');
    expect(owned).not.toContain('association.read');
    expect(owned).not.toContain('subscriber.self');
  });

  it('support plateforme : lecture seulement', () => {
    const support = permissionsOf('platform:support');
    expect(support).toContain('platform.associations.read');
    expect(support).not.toContain('platform.associations.manage');
  });

  it('rôle non résolu : seulement public et authenticated', () => {
    expect(permissionsOf(null)).toEqual(['public', 'authenticated']);
  });
});

describe('actorRoleOf', () => {
  it('rôle de la matrice selon l’espace', () => {
    expect(actorRoleOf('subscriber', { platformRole: 'owner' })).toBe('subscriber');
    expect(actorRoleOf('platform', { platformRole: 'support' })).toBe('platform:support');
    expect(actorRoleOf('platform', { platformRole: null })).toBeNull();
    expect(actorRoleOf('association', { platformRole: 'owner', membershipRole: 'viewer' })).toBe('association:viewer');
    expect(actorRoleOf('association', { platformRole: 'owner' })).toBeNull();
    expect(actorRoleOf('auth', { platformRole: 'owner' })).toBeNull();
  });
});
