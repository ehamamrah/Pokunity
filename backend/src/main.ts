import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './bootstrap';
import { AppConfig } from './shared/config/app-config';

async function main(): Promise<void> {
  const app = await createApp();
  const port = app.get(AppConfig).env.PORT;
  await app.listen(port, '0.0.0.0');
  new Logger('bootstrap').log({ msg: 'Pokunity API listening', port });
}

main().catch((error: Error) => {
  console.error(JSON.stringify({ level: 'error', msg: 'fatal startup error', error: error.message }));
  process.exit(1);
});
