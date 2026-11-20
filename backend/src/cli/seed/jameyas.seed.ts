import { Pool } from 'pg';

// Generates N Jameyas server-side in ONE statement (no round trips). Codes make it idempotent.
const JAMEYAS_SQL = `
  WITH dims AS (
    SELECT ARRAY['Riyadh','Jeddah','Dammam','Makkah','Madinah','Khobar','Taif','Abha','Tabuk','Buraidah',
                 'Hail','Jazan','Najran','Yanbu','Jubail'] AS cities,
           ARRAY['Savers','Circle','Community','Family Fund','Friends','Builders','Future','Barakah','Unity',
                 'Horizon','Growth','Neighbors'] AS kinds,
           ARRAY[20000,25000,30000,50000,75000,100000,120000,150000,200000,250000,300000,500000]::bigint[] AS amounts,
           ARRAY[6,8,10,12,12,12,15,18,20,24]::int[] AS durations),
  raw AS (
    SELECT g, floor(random() * 15)::int AS ci, floor(random() * 12)::int AS ki, floor(random() * 12)::int AS ai,
           floor(random() * 10)::int AS di, floor(random() * 4)::int AS mo, random() < 0.5 AS mid, random() AS age
    FROM generate_series(1, $1) g)
  INSERT INTO jameyas (code, name, monthly_amount, duration_months, start_date, created_at)
  SELECT 'JMY-' || lpad(g::text, 5, '0'),
         cities[ci + 1] || ' ' || kinds[ki + 1] || ' ' || durations[di + 1] || 'M',
         amounts[ai + 1], durations[di + 1],
         (date_trunc('month', now()) + make_interval(months => mo + 1) + CASE WHEN mid THEN interval '14 days' ELSE interval '0' END)::date,
         now() - age * interval '60 days'
  FROM raw, dims
  ON CONFLICT (code) DO NOTHING`;

// Fixed demo Jameyas used in the API docs and manual walkthroughs.
const DEMO_JAMEYAS_SQL = `
  INSERT INTO jameyas (code, name, monthly_amount, duration_months, start_date, created_at) VALUES
    ('DEMO-RIYADH', 'Riyadh Savers 12M', 100000, 12, (date_trunc('month', now()) + interval '1 month')::date, now() - interval '2 days'),
    ('DEMO-JEDDAH', 'Jeddah Circle 10M', 120000, 10, (date_trunc('month', now()) + interval '1 month 14 days')::date, now() - interval '20 days')
  ON CONFLICT (code) DO NOTHING`;

// Seats for Jameyas that have none yet. Earlier payout = higher fee (linear), last ~25% free.
// Fill level per Jameya is derived from a hash of its code, so ~9% of Jameyas are full.
const SEATS_SQL = `
  INSERT INTO seats (jameya_id, seat_number, fee, status)
  SELECT j.id, s,
         CASE WHEN s <= ceil(j.duration_months * 0.75)
              THEN round(j.monthly_amount * j.duration_months * (0.02 + (abs(hashtext(j.code || ':fee')) % 21) / 1000.0)
                         * (ceil(j.duration_months * 0.75) - s + 1) / ceil(j.duration_months * 0.75) / 100) * 100
              ELSE 0 END,
         CASE WHEN j.code = 'DEMO-RIYADH' THEN (CASE WHEN s IN (2, 11, 12) THEN 'AVAILABLE' ELSE 'TAKEN' END)
              WHEN j.code = 'DEMO-JEDDAH' THEN (CASE WHEN s IN (1, 2, 4) THEN 'TAKEN' ELSE 'AVAILABLE' END)
              WHEN random() < least(1.0, (abs(hashtext(j.code)) % 110) / 100.0) THEN 'TAKEN'
              ELSE 'AVAILABLE' END
  FROM jameyas j CROSS JOIN LATERAL generate_series(1, j.duration_months) s
  WHERE NOT EXISTS (SELECT 1 FROM seats x WHERE x.jameya_id = j.id)`;

export async function seedJameyas(pool: Pool, count: number): Promise<void> {
  await pool.query(DEMO_JAMEYAS_SQL);
  await pool.query(JAMEYAS_SQL, [count]);
  await pool.query(SEATS_SQL);
}
