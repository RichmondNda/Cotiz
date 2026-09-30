import { Module } from '@nestjs/common';

// Module racine du worker : relais outbox (lot 0.5), files BullMQ et tâches planifiées s'y ajoutent.
@Module({})
export class WorkerModule {}
