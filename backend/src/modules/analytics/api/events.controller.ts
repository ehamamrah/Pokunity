import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { RateLimits } from '../../../shared/http/rate-limit/policies';
import { RateLimit, RateLimitGuard } from '../../../shared/http/rate-limit/rate-limit.guard';
import { AuthenticatedUser, CurrentUser } from '../../../shared/http/current-user.decorator';
import { AnalyticsFacade } from '../analytics.facade';
import { IngestEventsDto } from './dto/ingest-events.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly analytics: AnalyticsFacade) {}

  @Post()
  @HttpCode(202)
  @UseGuards(RateLimitGuard)
  @RateLimit(RateLimits.events)
  ingest(@CurrentUser() user: AuthenticatedUser, @Body() body: IngestEventsDto) {
    const accepted = this.analytics.ingestClientEvents(user.id, body.events);
    return { accepted };
  }
}
