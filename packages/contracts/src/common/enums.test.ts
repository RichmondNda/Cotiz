import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DB_ENUMS, MemberStanding, STATUS_LABELS } from '../index.js';

const sql = readFileSync(fileURLToPath(new URL('../../../../docs/specs/schema.sql', import.meta.url)), 'utf8');

describe('énumérations', () => {
  it('DB_ENUMS = types ENUM de schema.sql', () => {
    const fromSql: Record<string, (string | undefined)[]> = {};
    for (const [, name = '', values = ''] of sql.matchAll(/CREATE TYPE (\w+) AS ENUM \(([^)]*)\)/g)) {
      fromSql[name] = [...values.matchAll(/'([^']*)'/g)].map((m) => m[1]);
    }
    expect(DB_ENUMS).toEqual(fromSql);
  });

  it('chaque famille de status-mapping.yaml a les valeurs de la colonne correspondante', () => {
    for (const [family, labels] of Object.entries(STATUS_LABELS)) {
      if (family === 'memberStanding') continue;
      const dbType = family.replace('.', '_') as keyof typeof DB_ENUMS;
      expect(DB_ENUMS[dbType], family).toBeDefined();
      expect(Object.keys(labels).sort(), family).toEqual([...DB_ENUMS[dbType]].sort());
    }
  });

  it('MemberStanding = valeurs de memberStanding dans status-mapping.yaml', () => {
    expect([...MemberStanding.options].sort()).toEqual(Object.keys(STATUS_LABELS.memberStanding).sort());
  });
});
