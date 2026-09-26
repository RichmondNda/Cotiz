// POST /api/projets/:id/import/analyse — analyse d'un fichier d'import. V0 : le fichier n'est pas lu,
// seul son nom compte (.xlsx ou .csv, sinon `fichier_invalide`) ; le contenu est celui de la maquette (MgImport).
import type { AnalyseImport } from '~~/types'

export default defineMockHandler(async (event): Promise<AnalyseImport> => {
  projetGestionnaire(parametre(event, 'id'))
  const { fichier } = await readBody<{ fichier?: string }>(event)
  if (!fichier || !/\.(xlsx|csv)$/i.test(fichier)) erreurMetier(422, 'fichier_invalide', 'Fichier invalide')
  return {
    fichier,
    nbLignes: 53,
    colonnes: [
      { colonne: 'Prénom', exemples: ['Aïcha', 'Yao', 'Mariam'], champ: 'prenom' },
      { colonne: 'NOM', exemples: ['Bamba', 'Kouamé', 'Coulibaly'], champ: 'nom' },
      { colonne: 'Tel', exemples: ['0712345678', '0501…', '0102…'], champ: 'telephone' },
      { colonne: 'Mail', exemples: ['[email]', '—', '[email]'], champ: 'email' },
      { colonne: 'Quartier', exemples: ['Yopougon', 'Abobo', 'Cocody'], champ: 'adresse' },
    ],
    compteurs: { pretes: 47, comptesExistants: 3, erreurs: 2, doublons: 1 },
    lignes: [
      { ligne: 12, prenom: 'Yao', nom: 'Kouamé', telephone: '07 12 34', statut: 'telephone_incomplet' },
      { ligne: 27, prenom: '', nom: 'Coulibaly', telephone: '+225 05 [XX XX XX XX]', statut: 'prenom_manquant' },
      { ligne: 31, prenom: 'Mariam', nom: 'Diallo', telephone: '+225 01 [XX XX XX XX]', statut: 'doublon', doublonDe: 8 },
      { ligne: 4, prenom: 'Kadiatou', nom: 'Sanogo', telephone: '+225 01 [XX XX XX XX]', statut: 'compte_existant' },
      { ligne: 1, prenom: 'Aïcha', nom: 'Bamba', telephone: '+225 07 12 34 56 78', statut: 'prete' },
    ],
  }
})
