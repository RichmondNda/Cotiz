import { Injectable } from '@nestjs/common';
import type { Plan } from '@cotiz/contracts';
import { allPlans } from './plan-records.js';

/** pf.plans : tous les plans, archivés compris, avec le nombre d'associations abonnées. */
@Injectable()
export class ListPlansUseCase {
  async execute(): Promise<{ items: Plan[] }> {
    return { items: await allPlans() };
  }
}
