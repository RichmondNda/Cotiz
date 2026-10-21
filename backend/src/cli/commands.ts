import { userInfo } from 'node:os';
import { type INestApplicationContext, Logger } from '@nestjs/common';
import { Email } from '@cotiz/contracts';
import { isUniqueViolation, pgErrorOf } from '@cotiz/db';
import { CONFIG, type Config } from '../config.js';
import {
  CreatePlatformOwnerUseCase,
  EmailAlreadyUsedError,
} from '../modules/identity/application/create-platform-owner.use-case.js';
import {
  IssueResetCodeUseCase,
  ResetNotAllowedError,
} from '../modules/identity/application/issue-reset-code.use-case.js';
import {
  SeedDevAccountsUseCase,
  SeedRefusedError,
} from '../modules/identity/application/seed-dev-accounts.use-case.js';
import { SeedDevMembershipsUseCase } from '../modules/access/access.public.js';
import { SeedDevPlansUseCase, SeedDevSubscriptionsUseCase } from '../modules/billing/billing.public.js';
import { SeedDevAssociationsUseCase } from '../modules/tenancy/tenancy.public.js';
import { TenantDatabase } from '../shared/tenant-context/index.js';

/**
 * Scripts d'exploitation : `pnpm --filter backend cli <commande> …`. Le résultat (dont un code à remettre) va sur la
 * sortie du terminal, jamais dans les journaux.
 */

export interface CliStreams {
  out: NodeJS.WritableStream;
  err: NodeJS.WritableStream;
}

const USAGE = [
  'Commandes :',
  '  create-platform-owner <email> <prénom> <nom>',
  '  reset-password <email>',
  '  seed-dev                (développement : comptes, associations et plans de référence)',
].join('\n');

const DATE = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
  timeStyle: 'short',
  timeZone: 'Africa/Abidjan',
});

/** Exécute la commande ; renvoie le code de sortie du processus. */
export async function runCli(app: INestApplicationContext, argv: string[], io: CliStreams): Promise<number> {
  const [command, ...args] = argv;
  try {
    if (command === 'create-platform-owner') return await createPlatformOwner(app, args, io);
    if (command === 'reset-password') return await resetPassword(app, args, io);
    if (command === 'seed-dev') return await seedDev(app, io);
  } catch (error) {
    // Jamais le message brut : celui d'une erreur SQL contient requête, paramètres et valeurs (email…).
    const pg = pgErrorOf(error);
    Logger.error(
      { msg: 'commande échouée', command, error: error instanceof Error ? error.name : 'inconnue', sqlState: pg?.code },
      'Cli',
    );
    io.err.write('Échec de la commande (détails dans le journal, sans données personnelles).\n');
    return 1;
  }
  io.err.write(`${command ? `Commande inconnue : ${command}\n` : ''}${USAGE}\n`);
  return 1;
}

async function createPlatformOwner(app: INestApplicationContext, args: string[], io: CliStreams): Promise<number> {
  const [rawEmail, firstName, lastName] = args.map((a) => a.trim());
  if (!rawEmail || !firstName || !lastName || args.length !== 3) {
    io.err.write(`Usage : create-platform-owner <email> <prénom> <nom>\n`);
    return 1;
  }
  const email = Email.safeParse(rawEmail.toLowerCase());
  if (!email.success) {
    io.err.write('Adresse email invalide.\n');
    return 1;
  }
  try {
    const issued = await app
      .get(TenantDatabase)
      .withTenantContext({ space: 'auth' }, () =>
        app.get(CreatePlatformOwnerUseCase).execute({ email: email.data, firstName, lastName, operator: operator() }),
      );
    io.out.write(
      [
        `Owner plateforme créé : ${firstName} ${lastName} <${email.data}>, en attente d’activation.`,
        `Code d’activation : ${issued.code} (valable jusqu’au ${DATE.format(issued.expiresAt)}, heure d’Abidjan)`,
        `À saisir sur ${issued.activationUrl} avec l’adresse email et un nouveau mot de passe.`,
        'Ce code ne sera plus affiché : remettez-le directement à la personne.',
        '',
      ].join('\n'),
    );
    return 0;
  } catch (error) {
    // Deux exécutions simultanées : la seconde bute sur l'unicité de users.email (et seulement elle).
    if (error instanceof EmailAlreadyUsedError || isUniqueViolation(error, 'users_email_key')) {
      io.err.write('Cette adresse est déjà utilisée par un compte.\n');
      return 1;
    }
    throw error;
  }
}

const TIME = new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short', timeZone: 'Africa/Abidjan' });

/** Code de réinitialisation du personnel plateforme (super-admin : pas de rôle supérieur pour traiter sa demande). */
async function resetPassword(app: INestApplicationContext, args: string[], io: CliStreams): Promise<number> {
  const email = Email.safeParse((args[0] ?? '').trim().toLowerCase());
  if (args.length !== 1 || !email.success) {
    io.err.write('Usage : reset-password <email>\n');
    return 1;
  }
  try {
    const issued = await app
      .get(TenantDatabase)
      .withTenantContext({ space: 'auth' }, () =>
        app.get(IssueResetCodeUseCase).execute({ email: email.data, operator: operator() }),
      );
    io.out.write(
      [
        `Code de réinitialisation : ${issued.code} (valable 15 minutes, jusqu’à ${TIME.format(issued.expiresAt)}, heure d’Abidjan)`,
        `À saisir sur ${resetPage(app)} avec l’adresse email, puis choisir un nouveau mot de passe.`,
        'Ce code ne sera plus affiché : remettez-le directement à la personne.',
        '',
      ].join('\n'),
    );
    return 0;
  } catch (error) {
    if (error instanceof ResetNotAllowedError) {
      io.err.write('Aucun membre actif du personnel plateforme avec cette adresse.\n');
      return 1;
    }
    throw error;
  }
}

/**
 * Données de développement (jamais en production) : comptes à mot de passe connu (ou code d'activation à remettre),
 * puis associations, plans, abonnements et appartenances de référence, aux identifiants des données simulées du front.
 */
async function seedDev(app: INestApplicationContext, io: CliStreams): Promise<number> {
  try {
    const db = app.get(TenantDatabase);
    const accounts = await db.withTenantContext({ space: 'auth' }, () => app.get(SeedDevAccountsUseCase).execute());
    io.out.write(
      [
        'Comptes de développement prêts (mot de passe connu, jamais en production) :',
        ...accounts.map((a) =>
          'password' in a
            ? `  ${a.identifier} / ${a.password}`
            : `  ${a.name}, ${a.identifier} : code d’activation ${a.activationCode} (valable jusqu’au ${DATE.format(a.expiresAt)}, heure d’Abidjan ; première connexion)`,
        ),
        '',
      ].join('\n'),
    );
    // Lignes de plusieurs associations et plans : écrits par cotiz_platform seulement (PLATFORM_DATABASE_URL).
    if (app.get<Config>(CONFIG).PLATFORM_DATABASE_URL === undefined) {
      io.err.write(
        'Associations et plans de référence non créés : PLATFORM_DATABASE_URL manquante (rôle cotiz_platform).\n',
      );
      return 1;
    }
    const { slugs, codes } = await db.withTenantContext(
      { space: 'platform' },
      async () => {
        const created = {
          slugs: await app.get(SeedDevAssociationsUseCase).execute(),
          codes: await app.get(SeedDevPlansUseCase).execute(),
        };
        await app.get(SeedDevSubscriptionsUseCase).execute();
        await app.get(SeedDevMembershipsUseCase).execute();
        return created;
      },
      { platformConnection: true },
    );
    io.out.write(`Plans de référence : ${codes.join(', ')}\nAssociations de référence : ${slugs.join(', ')}\n`);
    return 0;
  } catch (error) {
    if (error instanceof SeedRefusedError) {
      io.err.write(`Refusé : ${error.message}.\n`);
      return 1;
    }
    throw error;
  }
}

/** Page « Mot de passe oublié » de l'espace plateforme (étapes code et nouveau mot de passe). */
function resetPage(app: INestApplicationContext): string {
  const base = app.get<Config>(CONFIG).APP_PUBLIC_URL ?? 'http://localhost:3000';
  return `${new URL('/mot-de-passe', base).href}?profil=plateforme`;
}

/** Compte système qui lance le script, pour l'audit. */
function operator(): string {
  try {
    return `cli:${userInfo().username}`;
  } catch {
    return 'cli:inconnu';
  }
}
