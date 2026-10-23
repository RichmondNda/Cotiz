import { Injectable } from '@nestjs/common';
import type { AltchaChallenge } from '@cotiz/contracts';
import { AltchaService } from '../infra/altcha.service.js';

/** pub.challenge : défi ALTCHA du formulaire de demande, sans état côté serveur jusqu'à sa présentation. */
@Injectable()
export class CreateChallengeUseCase {
  constructor(private readonly altcha: AltchaService) {}

  execute(): Promise<AltchaChallenge> {
    return this.altcha.create();
  }
}
