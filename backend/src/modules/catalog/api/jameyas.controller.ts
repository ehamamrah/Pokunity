import { Controller, Get, Header, Param, Query, UseInterceptors } from '@nestjs/common';
import { Conditional } from '../../../shared/http/conditional';
import { ConditionalGetInterceptor } from '../../../shared/http/conditional-get.interceptor';
import { AuthenticatedUser, CurrentUser } from '../../../shared/http/current-user.decorator';
import { JameyaDetailService } from '../application/jameya-detail.service';
import { MarketplaceService } from '../application/marketplace.service';
import { ListJameyasQuery } from './dto/list-jameyas.query';

/** All reads are conditional (stable ETag + X-As-Of, 304 on match): see docs/performance/caching.md. */
@Controller('jameyas')
@UseInterceptors(ConditionalGetInterceptor)
export class JameyasController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly details: JameyaDetailService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, max-age=5')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListJameyasQuery): Promise<Conditional> {
    return this.marketplace.list(user.id, query);
  }

  @Get('featured')
  @Header('Cache-Control', 'private, max-age=5')
  featured(@CurrentUser() user: AuthenticatedUser): Promise<Conditional> {
    return this.marketplace.featured(user.id);
  }

  @Get(':id/similar')
  @Header('Cache-Control', 'private, max-age=5')
  similar(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Conditional> {
    return this.marketplace.similar(user.id, id);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-cache')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<Conditional> {
    return this.details.detail(user.id, id);
  }
}
