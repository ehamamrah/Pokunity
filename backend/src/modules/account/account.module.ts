import { Module } from '@nestjs/common';
import { ReservationsModule } from '../reservations/reservations.module';
import { UsersModule } from '../users/users.module';
import { MeController } from './me.controller';

/** Owns no tables: composes the viewer profile (GET /me) from public facades. */
@Module({ imports: [UsersModule, ReservationsModule], controllers: [MeController] })
export class AccountModule {}
