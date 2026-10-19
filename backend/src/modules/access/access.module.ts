import { Module } from '@nestjs/common';
import { SelfRoles } from './application/self-roles.js';
import { MembershipGuard } from './http/membership.guard.js';
import { PermissionGuard } from './http/permission.guard.js';
import { SpaceGuard } from './http/space.guard.js';

/**
 * Module access : gardes d'espace, d'appartenance et de permission (AppModule les enregistre globalement) ; rôles lus
 * « de soi » (SelfRoles).
 */
@Module({
  providers: [SelfRoles, SpaceGuard, MembershipGuard, PermissionGuard],
  exports: [SelfRoles, SpaceGuard, MembershipGuard, PermissionGuard],
})
export class AccessModule {}
