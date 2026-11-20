import { Client } from 'pg';

export interface Counted<T> {
  result: T;
  count: number;
  statements: string[];
}

type QueryFn = (...args: unknown[]) => unknown;

function statementOf(arg: unknown): string {
  const text = typeof arg === 'string' ? arg : (arg as { text?: string })?.text ?? '';
  return text.replace(/\s+/g, ' ').trim().slice(0, 80);
}

/**
 * Counts every SQL statement sent to PostgreSQL while `fn` runs (all pool and transaction queries go
 * through pg's Client#query). Used to prove that endpoints are O(1) in queries (no N+1).
 */
export async function countQueries<T>(fn: () => Promise<T>): Promise<Counted<T>> {
  const original = Client.prototype.query as unknown as QueryFn;
  const statements: string[] = [];
  (Client.prototype as unknown as { query: QueryFn }).query = function (this: Client, ...args: unknown[]) {
    statements.push(statementOf(args[0]));
    return original.apply(this, args);
  };
  try {
    const result = await fn();
    return { result, count: statements.length, statements };
  } finally {
    (Client.prototype as unknown as { query: QueryFn }).query = original;
  }
}
