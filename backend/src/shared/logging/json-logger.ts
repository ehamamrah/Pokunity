import { LoggerService } from '@nestjs/common';
import { RequestContextStore } from './request-context';

type Level = 'debug' | 'info' | 'warn' | 'error';
const rank: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Structured JSON-lines logger; every line carries the current requestId when available. */
export class JsonLogger implements LoggerService {
  constructor(private readonly minLevel: Level = 'info') {}

  log(message: unknown, ...params: unknown[]): void {
    this.write('info', message, params);
  }
  error(message: unknown, ...params: unknown[]): void {
    this.write('error', message, params);
  }
  warn(message: unknown, ...params: unknown[]): void {
    this.write('warn', message, params);
  }
  debug(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }
  verbose(message: unknown, ...params: unknown[]): void {
    this.write('debug', message, params);
  }

  private write(level: Level, message: unknown, params: unknown[]): void {
    if (rank[level] < rank[this.minLevel]) return;
    const context = typeof params.at(-1) === 'string' ? params.at(-1) : undefined;
    const line = {
      level,
      time: new Date().toISOString(),
      context,
      requestId: RequestContextStore.requestId(),
      ...(typeof message === 'object' && message !== null ? message : { msg: String(message) }),
    };
    process.stdout.write(`${JSON.stringify(line)}\n`);
  }
}
