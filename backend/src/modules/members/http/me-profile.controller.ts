import { Body, Controller, Get, Header, Patch } from '@nestjs/common';
import { meProfile } from '@cotiz/contracts';
import { Can, Endpoint, parseInput } from '../../../shared/http/index.js';
import { MyProfile } from '../application/my-profile.js';

/**
 * me.profile › get et patch (sa-profil, mg-profil, mb-profil) : profil de la personne connectée. Servi par le module
 * members, qui possède l'adresse du profil de souscripteur ; le changement de mot de passe est dans le module identity
 * (`identity/http/me.controller.ts`).
 */
@Controller('me/profile')
export class MeProfileController {
  constructor(private readonly profile: MyProfile) {}

  /** Propre à la personne : jamais mis en cache. */
  @Get()
  @Endpoint('me.profile', 'get')
  @Can('authenticated')
  @Header('Cache-Control', 'no-store')
  get() {
    return this.profile.get();
  }

  @Patch()
  @Endpoint('me.profile', 'patch')
  @Can('authenticated')
  @Header('Cache-Control', 'no-store')
  patch(@Body() body: unknown) {
    return this.profile.update(parseInput(meProfile.operations.patch.request.body, body));
  }
}
