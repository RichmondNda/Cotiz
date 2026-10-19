import { Module } from '@nestjs/common';
import { MembershipGuard } from './http/membership.guard.js';
import { PermissionGuard } from './http/permission.guard.js';
import { SpaceGuard } from './http/space.guard.js';

/** Module access : gardes d'espace, d'appartenance et de permission (AppModule les enregistre globalement). */
@Module({
  providers: [SpaceGuard, MembershipGuard, PermissionGuard],
  exports: [SpaceGuard, MembershipGuard, PermissionGuard],
})
export class AccessModule {}
