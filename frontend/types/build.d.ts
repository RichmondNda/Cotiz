// Constantes fixées au build (nuxt.config.ts, `vite.define`).
/** Build avec handlers simulés (NUXT_MOCKS≠0) ; absente hors build Nuxt (tests unitaires) : traitée comme `true`. */
declare const __COTIZ_MOCKS__: boolean | undefined
