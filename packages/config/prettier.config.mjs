// Configuration Prettier pour backend/, packages/* et tools/ (pas pour frontend/, pour ne pas reformater la V0).
/** @type {import('prettier').Config} */
export default {
  printWidth: 120,
  singleQuote: true,
  semi: true,
  trailingComma: 'all',
};
