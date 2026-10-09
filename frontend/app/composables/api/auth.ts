// Authentification des écrans publics : connexion (auth.login), second facteur (auth.mfa), première connexion
// (auth.activate), mot de passe oublié (auth.forgot, auth.verify, auth.reset). Identifiants : server/mocks/IDENTIFIANTS.md.
// À appeler dans `setup` : les étapes enchaînées (code provisoire, jeton de second facteur, jeton de réinitialisation)
// gardent leur état dans ce composable.
import { ApiError } from '@cotiz/api-client'
import type { CodeErreurAuth, DemandeConnexion, EnvoiCode, ProfilMotDePasse, ResultatConnexion, Role } from '~~/types'
import { formatTelephone } from '~/utils/format'
import { versE164 } from './vues/communs'

const SPACE = { souscripteur: 'subscriber', gestionnaire: 'association', superadmin: 'platform' } as const

/** Erreur des écrans d'authentification : code de l'interface (`CodeErreurAuth`), lu par `codeErreur()`. */
function erreurAuth(e: unknown, role: Role): never {
  if (!(e instanceof ApiError)) throw e
  const code: CodeErreurAuth | undefined = ({
    invalid_credentials: role === 'souscripteur' ? 'mot-de-passe-incorrect' : 'identifiants-incorrects',
    wrong_space: role === 'souscripteur' ? 'mot-de-passe-incorrect' : 'identifiants-incorrects',
    account_locked: 'blocage',
    association_suspended: 'compte-suspendu',
    invalid_code: 'code-incorrect',
    too_many_attempts: 'blocage',
    code_expired: 'code-expire',
  } as Record<string, CodeErreurAuth>)[e.code ?? '']
  throw Object.assign(new Error(code ?? e.message), { data: { code: code ?? e.code }, statusCode: e.status })
}

export function useAuth() {
  const client = useClient()
  let identifiant = ''
  let codeProvisoire = ''
  let espace: Role = 'souscripteur'
  let mfaToken = ''
  let resetToken = ''
  let espaceReinitialisation: 'subscriber' | 'association' = 'subscriber'
  let identifiantReinitialisation = ''

  return {
    async seConnecter(demande: DemandeConnexion): Promise<ResultatConnexion> {
      espace = demande.espace
      identifiant = demande.espace === 'souscripteur' ? versE164(demande.identifiant) : demande.identifiant.trim()
      try {
        const r = await client.call('auth.login', 'login', { body: { space: SPACE[demande.espace], identifier: identifiant, password: demande.motDePasse } })
        if (r.status === 'mfa_required') {
          mfaToken = r.mfaToken
          return { etape: 'code-requis', role: demande.espace }
        }
        return { etape: 'connecte', role: demande.espace }
      }
      catch (e) {
        // Compte non activé : le mot de passe saisi est le code remis par l'association (première connexion).
        if (e instanceof ApiError && e.code === 'account_not_activated') {
          codeProvisoire = demande.motDePasse
          return { etape: 'premiere-connexion', role: demande.espace, prenom: '' }
        }
        erreurAuth(e, demande.espace)
      }
    },
    /** Plateforme : code de vérification à 6 chiffres. */
    async verifierCodeConnexion(code: string): Promise<ResultatConnexion> {
      try {
        await client.call('auth.mfa', 'verify', { body: { mfaToken, code: code.replace(/\D/g, '') } })
        return { etape: 'connecte', role: 'superadmin' }
      }
      catch (e) {
        erreurAuth(e, 'superadmin')
      }
    },
    /** Première connexion : le code remis par l'association active le compte avec le mot de passe choisi. */
    async definirPremierMotDePasse(motDePasse: string): Promise<ResultatConnexion> {
      try {
        await client.call('auth.activate', 'activate', { body: { space: SPACE[espace], identifier: identifiant, code: codeProvisoire, newPassword: motDePasse } })
        return { etape: 'connecte', role: espace }
      }
      catch (e) {
        erreurAuth(e, espace)
      }
    },
    async demanderCodeMotDePasse(profil: ProfilMotDePasse, saisie: string): Promise<EnvoiCode> {
      espaceReinitialisation = profil === 'souscripteur' ? 'subscriber' : 'association'
      identifiantReinitialisation = profil === 'souscripteur' ? versE164(saisie) : saisie.trim()
      await client.call('auth.forgot', 'forgot', { body: { space: espaceReinitialisation, identifier: identifiantReinitialisation } })
      // Réponse identique que le compte existe ou non : la destination affichée est la saisie.
      return { destination: profil === 'souscripteur' ? formatTelephone(identifiantReinitialisation) : identifiantReinitialisation, delaiRenvoi: 60 }
    },
    async verifierCodeMotDePasse(code: string): Promise<{ ok: true }> {
      try {
        const r = await client.call('auth.verify', 'verify', { body: { space: espaceReinitialisation, identifier: identifiantReinitialisation, code: code.replace(/\D/g, '') } })
        resetToken = r.resetToken
        return { ok: true }
      }
      catch (e) {
        erreurAuth(e, 'souscripteur')
      }
    },
    async enregistrerMotDePasse(motDePasse: string): Promise<{ ok: true }> {
      await client.call('auth.reset', 'reset', { body: { resetToken, newPassword: motDePasse } })
      return { ok: true }
    },
  }
}
