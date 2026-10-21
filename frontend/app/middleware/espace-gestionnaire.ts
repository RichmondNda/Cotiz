// Espace gestionnaire : réservé à une session de l'espace (vraie session pour un espace basculé, utils/garde-espace.ts).
import { gardeEspace } from '~/utils/garde-espace'

export default defineNuxtRouteMiddleware(to => gardeEspace('gestionnaire', to))
