// Seul point d'accès à la base (architecture/02, règle dependency-cruiser « db-client-only-in-tenant-context »).
export { setRequestContext, WithoutTenantContext } from './request-context.js';
export { TenantContextInterceptor } from './tenant-context.interceptor.js';
export { TenantContextModule } from './tenant-context.module.js';
export {
  currentContext,
  currentTx,
  SPACES,
  type Space,
  type TenantContext,
  TenantDatabase,
  type Tx,
} from './tenant-database.js';
