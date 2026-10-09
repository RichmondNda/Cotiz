import { defineConfig } from 'drizzle-kit';

// Migrations écrites à la main en SQL (RLS, droits, déclencheurs) : nouvelle migration avec
//   pnpm --filter @cotiz/db exec drizzle-kit generate --custom --name <nom>
// Une migration commitée ne se modifie jamais : on en ajoute une.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './migrations',
});
