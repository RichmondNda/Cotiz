import { userInfo } from 'node:os';
import { type INestApplicationContext, Logger } from '@nestjs/common';
import { Email } from '@cotiz/contracts';
import {
  CreatePlatformOwnerUseCase,
  EmailAlreadyUsedError,
} from '../modules/identity/application/create-platform-owner.use-case.js';
import { TenantDatabase } from '../shared/tenant-context/index.js';

/**
 * Scripts d'exploitation : `pnpm --filter backend cli <commande> …`. Le résultat (dont un code à remettre) va sur la
 * sortie du terminal, jamais dans les journaux.
 */

export interface CliStreams {
  out: NodeJS.WritableStream;
  err: NodeJS.WritableStream;
}

const USAGE = ['Commandes :', '  create-platform-owner <email> <prénom> <nom>'].join('\n');

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
  } catch (error) {
    // Jamais le message brut : celui d'une erreur SQL contient requête, paramètres et valeurs (email…).
    const pg = pgError(error);
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

/** Compte système qui lance le script, pour l'audit. */
function operator(): string {
  try {
    return `cli:${userInfo().username}`;
  } catch {
    return 'cli:inconnu';
  }
}

/** Erreur PostgreSQL d'origine (Drizzle l'enveloppe dans `cause`) : SQLSTATE et contrainte en cause. */
function pgError(error: unknown): { code: string; constraint?: unknown } | undefined {
  for (let e = error; e instanceof Error; e = e.cause) {
    if ('code' in e && typeof e.code === 'string') return e as Error & { code: string; constraint?: unknown };
  }
  return undefined;
}

/** Violation d'unicité (23505) de la contrainte nommée, et d'aucune autre. */
export function isUniqueViolation(error: unknown, constraint: string): boolean {
  const pg = pgError(error);
  return pg?.code === '23505' && pg.constraint === constraint;
}
