#!/usr/bin/env node
// Écrit openapi.json depuis le registre compilé (dist/). Lancé par « pnpm --filter contracts openapi ».
import { writeFileSync } from 'node:fs';
import { format, resolveConfig } from 'prettier';
import { buildOpenApi } from '../dist/openapi.js';

const file = new URL('../openapi.json', import.meta.url);
const raw = JSON.stringify(buildOpenApi(), null, 2);
const path = file.pathname;
writeFileSync(file, await format(raw, { ...(await resolveConfig(path)), filepath: path }));
console.log('openapi.json régénéré');
