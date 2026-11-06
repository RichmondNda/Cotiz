import { describe, expect, it } from 'vitest'
import { codeActivationValide, formaterCodeActivation, normaliserCodeActivation } from '../../app/utils/code-activation'

describe('code d’activation : saisie tolérante', () => {
  it.each([
    ['K7M4-P9QX', 'K7M4P9QX'],
    ['k7m4-p9qx', 'K7M4P9QX'],
    ['K7M4P9QX', 'K7M4P9QX'],
    ['K7M4 P9QX', 'K7M4P9QX'],
    ['  k7 m4 - p9 qx ', 'K7M4P9QX'],
    ['K7M4 P9QX', 'K7M4P9QX'],
  ])('%j → %s', (saisie, attendu) => {
    expect(normaliserCodeActivation(saisie)).toBe(attendu)
    expect(codeActivationValide(saisie)).toBe(true)
    expect(formaterCodeActivation(saisie)).toBe('K7M4-P9QX')
  })

  it.each([
    ['', 'vide'],
    ['K7M4-P9Q', '7 caractères'],
    ['K7M4-P9QXZ', '9 caractères'],
    ['K0M4-P9QX', 'zéro, hors alphabet'],
    ['K1M4-P9QX', 'un, hors alphabet'],
    ['KOM4-P9QX', 'O, hors alphabet'],
    ['KIM4-P9QX', 'I, hors alphabet'],
    ['KLM4-P9QX', 'L, hors alphabet'],
    ['K7M4_P9QX', 'séparateur inconnu'],
  ])('%j refusé (%s)', (saisie) => {
    expect(codeActivationValide(saisie)).toBe(false)
    expect(formaterCodeActivation(saisie)).toBe(saisie)
  })
})
