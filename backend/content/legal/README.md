# Pages légales (`pub.legal`)

Textes servis par `GET /api/v1/public/legal/{slug}` (`cgu`, `confidentialite`, `mentions`), lus au démarrage de l'api.

- Un fichier par page : en-tête `title`, `version` (`majeure.mineure`), `updatedOn` (AAAA-MM-JJ), puis le Markdown.
- Une section = un titre `##` ; le front numérote les sections et construit le sommaire.
- Toute modification du texte change `version` et `updatedOn` (historique : `git log` de ce dossier).
- Textes provisoires de la maquette : à remplacer par ceux du conseil juridique avant la mise en ligne (lot 7.1).
