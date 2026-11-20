import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../../shared/http/public.decorator';
import { WebhookService } from '../application/webhook.service';
import { ProviderEventDto } from './dto/provider-event.dto';
import { WebhookSignatureGuard } from './webhook-signature.guard';

@Controller('payments')
export class PaymentsWebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Public()
  @Post('webhook')
  @HttpCode(200)
  @UseGuards(WebhookSignatureGuard)
  receive(@Body() event: ProviderEventDto) {
    return this.webhooks.receive(event);
  }
}
