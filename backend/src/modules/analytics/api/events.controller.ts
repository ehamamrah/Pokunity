import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AuthenticatedUser, CurrentUser } from '../../../shared/http/current-user.decorator';
import { AnalyticsFacade } from '../analytics.facade';
import { IngestEventsDto } from './dto/ingest-events.dto';

@Controller('events')
export class EventsController {
  constructor(private readonly analytics: AnalyticsFacade) {}

  @Post()
  @HttpCode(202)
  async ingest(@CurrentUser() user: AuthenticatedUser, @Body() body: IngestEventsDto) {
    const accepted = await this.analytics.ingestClientEvents(user.id, body.events);
    return { accepted };
  }
}
