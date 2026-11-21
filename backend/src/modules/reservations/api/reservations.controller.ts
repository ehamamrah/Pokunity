import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Query, Res, UseGuards, UseInterceptors } from '@nestjs/common';
import { Response } from 'express';
import { Errors } from '../../../shared/errors/app-error';
import { SessionPolicy } from '../../../shared/http/public.decorator';
import { Conditional, conditionalFromBody } from '../../../shared/http/conditional';
import { ConditionalGetInterceptor } from '../../../shared/http/conditional-get.interceptor';
import { AuthenticatedUser, CurrentUser } from '../../../shared/http/current-user.decorator';
import { RateLimits } from '../../../shared/http/rate-limit/policies';
import { RateLimit, RateLimitGuard } from '../../../shared/http/rate-limit/rate-limit.guard';
import { IdempotencyInterceptor } from '../../idempotency/idempotency.interceptor';
import { CancelReservationUseCase } from '../application/cancel-reservation.use-case';
import { CheckoutUseCase } from '../application/checkout.use-case';
import { CreateReservationUseCase } from '../application/create-reservation.use-case';
import { ReservationQueryService } from '../application/reservation-query.service';
import { CheckoutDto, CreateReservationDto, ListReservationsQuery } from './dto/reservation.dto';

// Malformed ids cannot exist: answer 404 like any unknown reservation.
const uuid = new ParseUUIDPipe({ version: '4', exceptionFactory: () => Errors.notFound('Reservation') });

@Controller('reservations')
@UseGuards(RateLimitGuard)
export class ReservationsController {
  constructor(
    private readonly create: CreateReservationUseCase,
    private readonly checkoutUseCase: CheckoutUseCase,
    private readonly cancel: CancelReservationUseCase,
    private readonly queries: ReservationQueryService,
  ) {}

  @Post()
  @SessionPolicy('strict')
  @RateLimit(RateLimits.reservationCreate)
  @UseInterceptors(IdempotencyInterceptor)
  reserve(@CurrentUser() user: AuthenticatedUser, @Body() body: CreateReservationDto) {
    return this.create.execute({ userId: user.id, jameyaId: body.jameyaId, seatNumber: body.seatNumber });
  }

  @Get()
  @RateLimit(RateLimits.reservationList)
  @Header('Cache-Control', 'private, no-cache')
  @UseInterceptors(ConditionalGetInterceptor)
  async list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListReservationsQuery): Promise<Conditional> {
    const page = await this.queries.list(user.id, { statuses: query.status ?? null, page: query.page, pageSize: query.pageSize });
    return conditionalFromBody(page, new Date());
  }

  @Get(':id')
  @RateLimit(RateLimits.reservationPoll)
  @Header('Cache-Control', 'private, no-cache')
  @UseInterceptors(ConditionalGetInterceptor)
  async get(@CurrentUser() user: AuthenticatedUser, @Param('id', uuid) id: string): Promise<Conditional> {
    return conditionalFromBody(await this.queries.get(user.id, id), new Date());
  }

  @Post(':id/checkout')
  @SessionPolicy('strict')
  @RateLimit(RateLimits.reservationCheckout)
  @UseInterceptors(IdempotencyInterceptor)
  async checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', uuid) id: string,
    @Body() body: CheckoutDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.checkoutUseCase.execute({ userId: user.id, reservationId: id, paymentMethodToken: body.paymentMethodToken });
    res.status(result.httpStatus);
    return result.body;
  }

  @Delete(':id')
  @RateLimit(RateLimits.reservationCancel)
  release(@CurrentUser() user: AuthenticatedUser, @Param('id', uuid) id: string) {
    return this.cancel.execute(user.id, id);
  }
}
