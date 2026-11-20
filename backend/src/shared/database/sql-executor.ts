import { QueryResult, QueryResultRow } from 'pg';

/**
 * Minimal query surface shared by the pool and a transaction client. Module facades that must
 * take part in a caller's transaction (Unit of Work) accept a `SqlExecutor` argument.
 */
export interface SqlExecutor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string | NamedSql,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

/**
 * A named (server-side prepared) statement: parsed and planned once per connection, then only
 * bound and executed. Used for the hottest statements on the read and booking paths.
 */
export interface NamedSql {
  name: string;
  text: string;
}

export const namedSql = (name: string, text: string): NamedSql => ({ name, text });

/** PostgreSQL SQLSTATE codes we react to explicitly. */
export const PgErrorCode = {
  UniqueViolation: '23505',
  SerializationFailure: '40001',
} as const;

export function isPgError(error: unknown, code: string, constraint?: string): boolean {
  const e = error as { code?: string; constraint?: string };
  return e?.code === code && (constraint === undefined || e.constraint === constraint);
}
