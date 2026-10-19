// Robustesse d'un mot de passe choisi par la personne (activation, réinitialisation, profil : errors.yaml weak_password).

export const MIN_PASSWORD_LENGTH = 10;

/**
 * Mots de passe courants d'au moins 10 caractères (les plus courts sont déjà refusés par la longueur) : listes
 * publiques de fuites, claviers AZERTY et QWERTY, mots français et formes locales. Comparés en minuscules.
 */
export const COMMON_PASSWORDS: ReadonlySet<string> = new Set([
  '1234567890',
  '0123456789',
  '0987654321',
  '9876543210',
  '1234512345',
  '1122334455',
  '1212121212',
  '1231231234',
  '12345678910',
  '123456789a',
  'a123456789',
  '123456789z',
  '1234567890a',
  '12345678900',
  '123456789123',
  'azertyuiop',
  'azertyuiop1',
  'azerty1234',
  'azerty12345',
  'azerty123456',
  'azertyqsdf',
  'qsdfghjklm',
  'wxcvbnwxcvbn',
  'qwertyuiop',
  'qwerty1234',
  'qwerty12345',
  'qwerty123456',
  'qwertyuiop1',
  'asdfghjkl1',
  'zxcvbnm123',
  '1qaz2wsx3edc',
  '1q2w3e4r5t',
  'q1w2e3r4t5',
  'a1z2e3r4t5',
  'zaq12wsxcde3',
  'qazwsxedcrfv',
  'qwertzuiop',
  'password12',
  'password123',
  'password1234',
  'password!1',
  'passw0rd123',
  'p@ssw0rd123',
  'p@ssword123',
  'passwordpassword',
  'motdepasse',
  'motdepasse1',
  'motdepasse12',
  'motdepasse123',
  'motdepasse1234',
  'mot2passe123',
  'monmotdepasse',
  'motdepasse!',
  'motdepasse2024',
  'motdepasse2025',
  'motdepasse2026',
  'nouveaumotdepasse',
  'changezmoi1',
  'changeme123',
  'changeme1234',
  'welcome123',
  'welcome1234',
  'bienvenue1',
  'bienvenue12',
  'bienvenue123',
  'bienvenue2026',
  'iloveyou12',
  'iloveyou123',
  'jetaime1234',
  'jetaime12345',
  'jetaimebeaucoup',
  'monamour123',
  'soleil12345',
  'princesse1',
  'princesse12',
  'princesse123',
  'chocolat12',
  'chocolat123',
  'football12',
  'football123',
  'baseball123',
  'basketball',
  'basketball1',
  'superman123',
  'batman12345',
  'starwars123',
  'dragon12345',
  'monkey12345',
  'sunshine123',
  'shadow12345',
  'master12345',
  'letmein1234',
  'trustno1234',
  'administrateur',
  'administrator',
  'admin12345',
  'admin123456',
  'adminadmin',
  'administrateur1',
  'root123456',
  'utilisateur',
  'utilisateur1',
  'cotiz12345',
  'cotiz123456',
  'cotizcotiz',
  'motdepassecotiz',
  'cotiz20262026',
  'cotisation',
  'cotisation1',
  'cotisation123',
  'tontine123',
  'tontine1234',
  'association',
  'association1',
  'abidjan123',
  'abidjan2026',
  'abidjan225',
  'cotedivoire',
  'cotedivoire1',
  'cotedivoire225',
  'yopougon123',
  'cocody1234',
  'dakar12345',
  'senegal221',
  'bamako1234',
  'ouagadougou',
  'lome123456',
  'cotonou1234',
  'allahakbar',
  'allahouakbar',
  'bismillah1',
  'bismillah123',
  'alhamdulillah',
  'jesuschrist',
  'jesus12345',
  'dieuestbon',
  'dieuestamour',
  'jesusmonsauveur',
  'gloireadieu',
  'merciseigneur',
  'aaaaaaaaaa',
  '1111111111',
  '0000000000',
  'abcdefghij',
  'abcdefghijk',
  'abc1234567',
  'abcd123456',
  'abcdef123456',
]);

/**
 * Racines courantes, de toute longueur : une variante (`Motdepasse2027`, `azertyuiop!`) reste un mot de passe courant
 * une fois retirés les chiffres et la ponctuation qui l'entourent.
 */
const COMMON_ROOTS: ReadonlySet<string> = new Set([
  'password',
  'passw0rd',
  'motdepasse',
  'azerty',
  'azertyuiop',
  'qwerty',
  'qwertyuiop',
  'bienvenue',
  'welcome',
  'soleil',
  'jetaime',
  'iloveyou',
  'monamour',
  'princesse',
  'chocolat',
  'football',
  'admin',
  'administrateur',
  'cotiz',
  'cotisation',
  'tontine',
  'association',
  'abidjan',
  'cotedivoire',
  'changeme',
  'letmein',
  'secret',
]);

const normalize = (value: string) => value.trim().toLowerCase();

/** Le mot sans les chiffres, la ponctuation et les espaces qui l'entourent (`2026Password!` → `password`). */
const core = (value: string) => value.replace(/^[\d\W_]+|[\d\W_]+$/gu, '');

/** Fragments d'identifiant interdits : l'identifiant, la partie locale d'un email, les 8 derniers chiffres d'un téléphone. */
function identifierParts(identifier: string): string[] {
  const value = normalize(identifier);
  const parts = [value, value.replace(/^\+/, '')];
  const local = value.split('@')[0] ?? '';
  if (value.includes('@') && local.length >= 4) parts.push(local);
  const digits = value.replace(/\D/g, '');
  if (!value.includes('@') && digits.length >= 8) parts.push(digits.slice(-8));
  return parts.filter((part) => part.length >= 4);
}

/**
 * Mot de passe assez robuste : au moins 10 caractères une fois les espaces autour retirés, ni courant (liste, ou
 * variante d'une racine courante), ni un seul caractère répété, ni uniquement des chiffres (dates, téléphones), ni
 * contenant l'identifiant de la personne (email, partie locale, fin du téléphone).
 */
export function isStrongPassword(password: string, context: { identifier?: string } = {}): boolean {
  const value = normalize(password);
  // Longueur en caractères (points de code), pas en unités UTF-16.
  if ((value.match(/./gsu)?.length ?? 0) < MIN_PASSWORD_LENGTH) return false;
  if (COMMON_PASSWORDS.has(value)) return false;
  const root = core(value);
  if (root.length < 4 || COMMON_PASSWORDS.has(root) || COMMON_ROOTS.has(root)) return false;
  if (/^(.)\1+$/u.test(value) || /^\d+$/.test(value)) return false;
  if (context.identifier && identifierParts(context.identifier).some((part) => value.includes(part))) return false;
  return true;
}
