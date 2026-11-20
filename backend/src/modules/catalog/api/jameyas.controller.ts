import { Controller, Get, Header, Param, Query, UseInterceptors } from '@nestjs/common';
import { EtagInterceptor } from '../../../shared/http/etag.interceptor';
import { AuthenticatedUser, CurrentUser } from '../../../shared/http/current-user.decorator';
import { JameyaDetailService } from '../application/jameya-detail.service';
import { MarketplaceService } from '../application/marketplace.service';
import { ListJameyasQuery } from './dto/list-jameyas.query';

@Controller('jameyas')
@UseInterceptors(EtagInterceptor)
export class JameyasController {
  constructor(
    private readonly marketplace: MarketplaceService,
    private readonly details: JameyaDetailService,
  ) {}

  @Get()
  @Header('Cache-Control', 'private, max-age=5')
  list(@CurrentUser() user: AuthenticatedUser, @Query() query: ListJameyasQuery) {
    return this.marketplace.list(user.id, query);
  }

  @Get('featured')
  @Header('Cache-Control', 'private, max-age=5')
  featured(@CurrentUser() user: AuthenticatedUser) {
    return this.marketplace.featured(user.id);
  }

  @Get(':id')
  @Header('Cache-Control', 'private, no-cache')
  detail(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string) {
    return this.details.detail(user.id, id);
  }
}
