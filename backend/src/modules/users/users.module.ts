import { Module } from '@nestjs/common';
import { KycService } from './application/kyc.service';
import { KycCache } from './infrastructure/kyc-cache';
import { KycSimulatorAdapter } from './infrastructure/kyc-simulator.adapter';
import { UsersRepository } from './infrastructure/users.repository';
import { KycProvider } from './kyc-provider.port';
import { UsersFacade } from './users.facade';

/** Owns: users, user_behavior, kyc_simulator_profiles. */
@Module({
  providers: [
    UsersFacade,
    UsersRepository,
    KycService,
    KycCache,
    { provide: KycProvider, useClass: KycSimulatorAdapter },
  ],
  exports: [UsersFacade],
})
export class UsersModule {}
