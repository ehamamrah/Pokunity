import { QueryResult, QueryResultRow } from 'pg';

/**
 * Minimal query surface shared by the pool and a transaction client. Module facades that must
 * take part in a caller's transaction (Unit of Work) accept a `SqlExecutor` argument.
 */
export interface SqlExecutor {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

/** PostgreSQL SQLSTATE codes we react to explicitly. */
export const PgErrorCode = {
  UniqueViolation: '23505',
  SerializationFailure: '40001',
} as const;

export function isPgError(error: unknown, code: string, constraint?: string): boolean {
  const e = error as { code?: string; constraint?: string };
  return e?.code === code && (constraint === undefined || e.constraint === constraint);
}
