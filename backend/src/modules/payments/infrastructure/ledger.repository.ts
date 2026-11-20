import { Injectable } from '@nestjs/common';
import { SqlExecutor } from '../../../shared/database/sql-executor';

export type LedgerEntryType = 'AUTHORIZE' | 'CAPTURE' | 'VOID';

// UNIQUE (payment_id, entry_type): a second capture/void/authorize entry is impossible.
const INSERT_SQL = `
  INSERT INTO ledger_entries (payment_id, entry_type, amount, currency)
  SELECT id, $2, amount, currency FROM payments WHERE id = $1
  ON CONFLICT (payment_id, entry_type) DO NOTHING`;

// A VOID entry only makes sense when an authorization was recorded.
const INSERT_VOID_SQL = `
  INSERT INTO ledger_entries (payment_id, entry_type, amount, currency)
  SELECT payment_id, 'VOID', amount, currency FROM ledger_entries
  WHERE payment_id = $1 AND entry_type = 'AUTHORIZE'
  ON CONFLICT (payment_id, entry_type) DO NOTHING`;

/** Append-only money ledger (UPDATE/DELETE rejected by trigger). */
@Injectable()
export class LedgerRepository {
  async append(tx: SqlExecutor, paymentId: string, type: Exclude<LedgerEntryType, 'VOID'>): Promise<void> {
    await tx.query(INSERT_SQL, [paymentId, type]);
  }

  async has(tx: SqlExecutor, paymentId: string, type: LedgerEntryType): Promise<boolean> {
    const res = await tx.query('SELECT 1 FROM ledger_entries WHERE payment_id = $1 AND entry_type = $2', [paymentId, type]);
    return res.rowCount === 1;
  }

  async appendVoid(tx: SqlExecutor, paymentId: string): Promise<void> {
    await tx.query(INSERT_VOID_SQL, [paymentId]);
  }
}
