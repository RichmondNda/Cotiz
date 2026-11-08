import { randomUUID } from 'node:crypto';
import { type CotizRole, ROLE_PASSWORDS } from '@cotiz/db/testing';
import pg from 'pg';
import { inject } from 'vitest';

/**
 * PostgreSQL partagé par tous les fichiers de test d'une exécution (démarré par `global-setup.ts`) : rôles Cotiz créés,
 * migrations appliquées une fois dans la base modèle. Chaque fichier travaille dans sa propre copie de ce modèle
 * (`CREATE DATABASE … TEMPLATE`, ≈ 150 ms contre ≈ 7 s pour un conteneur migré).
 */
export interface SharedPostgres {
  /** Superutilisateur, base d'administration `postgres` (jamais la base modèle : une connexion y bloquerait la copie). */
  adminUrl: string;
  /** Base migrée copiée par chaque fichier. */
  template: string;
}

declare module 'vitest' {
  interface ProvidedContext {
    /** `null` : désactivé (COTIZ_TEST_SHARED_PG=0) ou Docker absent ; chaque fichier démarre alors son conteneur. */
    sharedPostgres: SharedPostgres | null;
  }
}

/** Base d'un fichier de test : mêmes accès que `TestDatabase` (`@cotiz/db/testing`), sans conteneur propre. */
export interface FileDatabase {
  /** Superutilisateur : préparation des tests uniquement. */
  superuserUrl: string;
  urlFor(role: CotizRole, database?: string): string;
  /** Libère la base (ou arrête le conteneur dédié). */
  dispose(): Promise<void>;
}

/** Serveur partagé de l'exécution, s'il y en a un (hors de vitest ou sans globalSetup : `null`). */
export function sharedPostgres(): SharedPostgres | null {
  try {
    return inject('sharedPostgres') ?? null;
  } catch {
    return null;
  }
}

/** Copie de la base modèle (migrée), ou base vide (`template0`) quand `migrated` est faux. */
export async function createFileDatabase(shared: SharedPostgres, migrated: boolean): Promise<FileDatabase> {
  const name = `f_${randomUUID().replaceAll('-', '')}`;
  await admin(shared.adminUrl, `CREATE DATABASE ${name} TEMPLATE ${migrated ? shared.template : 'template0'}`);
  // Réglages de la base elle-même, que la copie ne reprend pas : partie « base » de 01-roles.sql (ROLES_SCRIPT), seule
  // rejouée ici (ses ALTER ROLE, globaux au serveur, entreraient en conflit d'un fichier à l'autre).
  const dbUrl = new URL(shared.adminUrl);
  dbUrl.pathname = `/${name}`;
  await admin(
    dbUrl.toString(),
    `ALTER DATABASE ${name} OWNER TO cotiz_migrator;
     REVOKE TEMPORARY ON DATABASE ${name} FROM PUBLIC;
     ALTER SCHEMA public OWNER TO cotiz_migrator;
     REVOKE ALL ON SCHEMA public FROM PUBLIC;`,
  );
  const urlFor = (role: CotizRole | 'superuser', database = name) => {
    const url = new URL(shared.adminUrl);
    if (role !== 'superuser') {
      url.username = role;
      url.password = ROLE_PASSWORDS[role];
    }
    url.pathname = `/${database}`;
    return url.toString();
  };
  return {
    superuserUrl: urlFor('superuser'),
    urlFor,
    dispose: async () => {
      // Sans FORCE : une connexion encore ouverte (pool d'un test mal fermé) n'est pas coupée ; la base reste alors
      // jusqu'à l'arrêt du conteneur partagé.
      await admin(shared.adminUrl, `DROP DATABASE IF EXISTS ${name}`).catch(() => undefined);
    },
  };
}

async function admin(url: string, text: string): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(text);
  } finally {
    await client.end();
  }
}
