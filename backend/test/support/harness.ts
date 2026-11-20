import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../../src/bootstrap';
import { Database } from '../../src/shared/database/database.service';
import './test-env';

export interface Harness {
  app: INestApplication;
  http: ReturnType<typeof request>;
  db: Database;
  close: () => Promise<void>;
}

/** Boots the real application (real PostgreSQL + Redis), jobs disabled and driven manually. */
export async function startHarness(): Promise<Harness> {
  const app = await createApp();
  await app.init();
  return {
    app,
    http: request(app.getHttpServer()),
    db: app.get(Database),
    close: () => app.close(),
  };
}
