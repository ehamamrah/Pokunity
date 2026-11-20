import { Pool } from 'pg';

export const DEMO_CAMPAIGN = 'winter-savings-2026';

const DEMO_FEATURED_SQL = `
  INSERT INTO featured_campaigns (jameya_id, campaign, priority, starts_at, ends_at)
  SELECT id, $1, CASE code WHEN 'DEMO-RIYADH' THEN 1 ELSE 2 END, now() - interval '1 day', now() + interval '90 days'
  FROM jameyas WHERE code IN ('DEMO-RIYADH', 'DEMO-JEDDAH')
  ON CONFLICT (campaign, jameya_id) DO NOTHING`;

// Marketing picks 13 more open Jameyas, only on first seed (keeps the campaign stable across restarts).
const RANDOM_FEATURED_SQL = `
  INSERT INTO featured_campaigns (jameya_id, campaign, priority, starts_at, ends_at)
  SELECT id, $1, 2 + row_number() OVER (), now() - interval '1 day', now() + interval '90 days'
  FROM (SELECT j.id FROM jameyas j
        WHERE j.code LIKE 'JMY-%' AND EXISTS (SELECT 1 FROM seats s WHERE s.jameya_id = j.id AND s.status = 'AVAILABLE')
        ORDER BY md5(j.code) LIMIT 13) picks
  WHERE (SELECT count(*) FROM featured_campaigns WHERE campaign = $1) < 3
  ON CONFLICT (campaign, jameya_id) DO NOTHING`;

export async function seedFeatured(pool: Pool): Promise<void> {
  await pool.query(DEMO_FEATURED_SQL, [DEMO_CAMPAIGN]);
  await pool.query(RANDOM_FEATURED_SQL, [DEMO_CAMPAIGN]);
}
