// Traitement d'une demande (lot 1.3) : accès à remettre (handoff) et message prêt du refus, sans email (ui-deviations.md).
import type { Handoff } from '@cotiz/contracts'
import { describe, expect, it } from 'vitest'
import { vueAcces } from '~/composables/api/vues/communs'
import { mailtoRefusDemande, messageRefusDemande } from '~/utils/demandes'

describe('vueAcces', () => {
  it('destinataire, code, expiration, message et liens du handoff', () => {
    const h: Handoff = {
      code: 'K7M4-P9QX', expiresAt: '2026-10-30T10:00:00Z', message: 'Bonjour Mariam…',
      recipient: { id: '00000000-0000-7000-8000-000000000001', firstName: 'Mariam', lastName: 'Ouattara', phone: '+2250700000000', email: null },
      activationUrl: null, whatsappUrl: 'https://wa.me/2250700000000?text=Bonjour', smsUrl: 'sms:+2250700000000?body=Bonjour', mailtoUrl: null,
    }
    expect(vueAcces(h)).toEqual({
      destinataire: 'Mariam Ouattara', code: 'K7M4-P9QX', expireLe: '2026-10-30T10:00:00Z', message: 'Bonjour Mariam…',
      whatsapp: 'https://wa.me/2250700000000?text=Bonjour', sms: 'sms:+2250700000000?body=Bonjour', mailto: null, lien: null,
    })
  })
})

describe('message de refus', () => {
  it('motif en minuscule initiale, précisions à la suite', () => {
    expect(messageRefusDemande('Mariam', 'Informations incomplètes', '  Merci de compléter.  ')).toBe(
      'Bonjour Mariam, nous ne pouvons pas donner suite à votre demande pour le moment. Motif : informations incomplètes. Merci de compléter.')
  })

  it('sans motif ni précisions : la phrase d’ouverture seule', () => {
    expect(messageRefusDemande('Mariam', null)).toBe('Bonjour Mariam, nous ne pouvons pas donner suite à votre demande pour le moment.')
  })

  it('mailto encodé (destinataire, sujet, corps)', () => {
    const lien = mailtoRefusDemande('m.ouattara@exemple.ci', 'Tontine d’Adjamé', 'Motif : a & b ?')
    expect(lien.startsWith('mailto:m.ouattara%40exemple.ci?subject=')).toBe(true)
    const q = new URLSearchParams(lien.slice(lien.indexOf('?') + 1))
    expect(q.get('subject')).toBe('Votre demande pour Tontine d’Adjamé sur Cotiz')
    expect(q.get('body')).toBe('Motif : a & b ?')
  })
})
