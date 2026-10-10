// Configuration ESLint partagée (flat config) pour backend/, packages/* et tools/.
// frontend/ garde @nuxt/eslint et sa propre configuration.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export const ignores = [
  '**/node_modules/**',
  '**/dist/**',
  '**/.turbo/**',
  '**/coverage/**',
  'frontend/**',
  'design/**',
  'docs/**',
  'prompts/**',
  'graphify-out/**',
];

/** Tables de @cotiz/db réservées à leur module (users reste lisible partout : noms affichés). */
const MODULE_TABLES = {
  identity: ['credentials', 'sessions', 'oneTimeCodes', 'passwordResetRequests'],
  access: ['platformStaff'],
};

function restrictedTables(modules) {
  return {
    paths: modules.map((module) => ({
      name: '@cotiz/db',
      importNames: MODULE_TABLES[module],
      message: `table réservée au module ${module} : passer par src/modules/${module}/${module}.public.ts`,
    })),
  };
}

export default tseslint.config(
  { ignores },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      // Espaces invisibles (U+202F, U+00A0 des montants) : toujours écrits en échappement, jamais en littéral.
      'no-irregular-whitespace': [
        'error',
        { skipStrings: false, skipTemplates: false, skipRegExps: false, skipComments: false },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // Modules NestJS : classes vides portant @Module.
      '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
    },
  },
  // Tables globales sans RLS (architecture/02) : accès limité à leur module, les autres passent par sa surface
  // publique. Secrets d'authentification au module identity, personnel de la plateforme au module access.
  {
    files: ['backend/src/**/*.ts'],
    ignores: ['backend/src/modules/identity/**', 'backend/src/**/*.test.ts'],
    rules: { 'no-restricted-imports': ['error', restrictedTables(['identity'])] },
  },
  {
    files: ['backend/src/**/*.ts'],
    ignores: ['backend/src/modules/access/**', 'backend/src/**/*.test.ts'],
    rules: { 'no-restricted-imports': ['error', restrictedTables(['access'])] },
  },
  {
    files: ['backend/src/**/*.ts'],
    ignores: ['backend/src/modules/identity/**', 'backend/src/modules/access/**', 'backend/src/**/*.test.ts'],
    rules: { 'no-restricted-imports': ['error', restrictedTables(['identity', 'access'])] },
  },
  // Fichiers JavaScript (configurations, outils) : pas d'analyse de types.
  { files: ['**/*.{js,mjs,cjs}'], ...tseslint.configs.disableTypeChecked },
  prettier,
);
