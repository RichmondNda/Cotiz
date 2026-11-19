import { Email, IMPORT_REQUIRED_FIELDS, type ImportField } from '@cotiz/contracts';
import { type CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js/max';
import type { z } from 'zod';

type Field = z.infer<typeof ImportField>;
export type ImportValues = Partial<Record<Field, string>>;
export interface RowError {
  field: Field | null;
  code: string;
}

/** Longueurs maximales de NewMemberInput (en.create). */
const MAX_LENGTH: Readonly<Record<Field, number>> = {
  firstName: 80,
  lastName: 80,
  phone: 40,
  email: 254,
  address: 200,
};

/** Correspondance refusée par `im.steps` (mapping) : colonne inconnue, champ obligatoire absent, champ en double. */
export function mappingProblem(
  mapping: Readonly<Record<string, Field | null>>,
  headers: readonly string[],
): Record<string, string> | null {
  const unknown = Object.keys(mapping).find((name) => !headers.includes(name));
  if (unknown !== undefined) return { mapping: 'unknown_column' };
  const fields = Object.values(mapping).filter((f): f is Field => f !== null);
  const missing = IMPORT_REQUIRED_FIELDS.filter((f) => !fields.includes(f));
  if (missing.length > 0) return Object.fromEntries(missing.map((f) => [`mapping.${f}`, 'required']));
  const twice = fields.find((f, i) => fields.indexOf(f) !== i);
  if (twice !== undefined) return { [`mapping.${twice}`]: 'duplicate' };
  return null;
}

/** Valeurs d'une ligne : cellules des colonnes retenues, puis corrections du gestionnaire (qui priment). */
export function valuesOf(
  cells: Readonly<Record<string, string>>,
  mapping: Readonly<Record<string, Field | null>>,
  corrections: ImportValues = {},
): ImportValues {
  const values: ImportValues = {};
  for (const [column, field] of Object.entries(mapping)) {
    if (field) values[field] = cells[column] ?? '';
  }
  for (const [field, value] of Object.entries(corrections) as [Field, string][]) values[field] = value.trim();
  return values;
}

/** Pays saisis en toutes lettres (`associations.country` est un texte libre) → région téléphonique. */
const REGIONS: Record<string, CountryCode> = {
  'cote d ivoire': 'CI',
  senegal: 'SN',
  mali: 'ML',
  'burkina faso': 'BF',
  benin: 'BJ',
  togo: 'TG',
  niger: 'NE',
  guinee: 'GN',
  cameroun: 'CM',
  gabon: 'GA',
  congo: 'CG',
  france: 'FR',
};

/**
 * Région des numéros nationaux d'une association : code ISO (`CI`) ou nom du pays (`Côte d’Ivoire`, accents et
 * apostrophes ignorés) ; inconnu → Côte d'Ivoire, comme la saisie du front (`versE164`, +225).
 */
export function phoneRegionOf(country: string): CountryCode {
  const trimmed = country.trim();
  if (/^[A-Za-z]{2}$/.test(trimmed)) return trimmed.toUpperCase() as CountryCode;
  const key = trimmed
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z]+/g, ' ')
    .trim();
  return REGIONS[key] ?? 'CI';
}

/**
 * Téléphone saisi → E.164, numéros nationaux lus dans le pays de l'association (`07 12 34 56 78` → +225…).
 * Un numéro lu comme nombre par Excel perd son zéro initial (712345678) : on le retente avec le zéro. `null` : invalide.
 */
export function normalizeImportPhone(input: string, country: string): string | null {
  const region = phoneRegionOf(country);
  const parse = (value: string) => {
    const parsed = parsePhoneNumberFromString(value, region);
    return parsed?.isValid() ? parsed.number : null;
  };
  const trimmed = input.trim().replace(/^00/, '+');
  return parse(trimmed) ?? (/^[1-9][\d\s.-]*$/.test(trimmed) ? parse(`0${trimmed}`) : null);
}

export interface CheckedRow {
  values: ImportValues;
  /** E.164, `null` si le téléphone est absent ou invalide. */
  phone: string | null;
  errors: RowError[];
}

/**
 * Contrôle d'une ligne, dans l'ordre du formulaire d'inscription : prénom, nom, téléphone obligatoires ; longueurs de
 * NewMemberInput ; téléphone valide (`invalid_phone`), email valide s'il est renseigné (`invalid_email`).
 */
export function checkRow(values: ImportValues, country: string): CheckedRow {
  const errors: RowError[] = [];
  for (const field of IMPORT_REQUIRED_FIELDS) {
    if ((values[field] ?? '') === '') errors.push({ field, code: 'required' });
  }
  for (const [field, value] of Object.entries(values) as [Field, string][]) {
    if (value.length > MAX_LENGTH[field]) errors.push({ field, code: 'too_long' });
  }
  const raw = values.phone ?? '';
  const phone = raw === '' ? null : normalizeImportPhone(raw, country);
  if (raw !== '' && phone === null && !errors.some((e) => e.field === 'phone')) {
    errors.push({ field: 'phone', code: 'invalid_phone' });
  }
  const email = values.email ?? '';
  if (email !== '' && !Email.safeParse(email).success && !errors.some((e) => e.field === 'email')) {
    errors.push({ field: 'email', code: 'invalid_email' });
  }
  return { values, phone, errors };
}
