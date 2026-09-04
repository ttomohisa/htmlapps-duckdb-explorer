-- DuckDB Explorer v1.0.0 test database
-- Generated deterministically. No external extensions are required.

CREATE SCHEMA analytics;

CREATE TABLE main.customers (
  customer_id BIGINT PRIMARY KEY,
  display_name VARCHAR NOT NULL,
  email VARCHAR,
  country VARCHAR NOT NULL,
  joined_on DATE NOT NULL,
  active BOOLEAN NOT NULL,
  lifetime_value DECIMAL(14,2) NOT NULL,
  tags VARCHAR[]
);

INSERT INTO main.customers
SELECT
  i::BIGINT,
  'Customer ' || lpad(i::VARCHAR, 3, '0'),
  CASE WHEN i % 11 = 0 THEN NULL ELSE 'customer' || i::VARCHAR || '@example.test' END,
  CASE i % 6
    WHEN 0 THEN 'Japan'
    WHEN 1 THEN 'United States'
    WHEN 2 THEN 'Germany'
    WHEN 3 THEN 'France'
    WHEN 4 THEN 'Singapore'
    ELSE 'Australia'
  END,
  DATE '2024-01-01' + i::INTEGER,
  i % 9 <> 0,
  round((125.75 + i * 37.19)::DECIMAL(14,2), 2),
  CASE
    WHEN i % 5 = 0 THEN ['newsletter', 'beta']
    WHEN i % 3 = 0 THEN ['newsletter']
    ELSE []::VARCHAR[]
  END
FROM range(1, 121) AS t(i);

CREATE TABLE main.orders (
  order_id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  ordered_at TIMESTAMP NOT NULL,
  status VARCHAR NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  tax DECIMAL(12,2) NOT NULL,
  total DECIMAL(12,2) NOT NULL,
  note VARCHAR,
  metadata STRUCT(channel VARCHAR, priority INTEGER)
);

INSERT INTO main.orders
SELECT
  i::BIGINT,
  (((i - 1) % 120) + 1)::BIGINT,
  TIMESTAMP '2025-01-01 08:00:00' + i * INTERVAL '3 hours',
  CASE i % 5 WHEN 0 THEN 'cancelled' WHEN 1 THEN 'paid' WHEN 2 THEN 'shipped' WHEN 3 THEN 'delivered' ELSE 'processing' END,
  round((20.00 + (i % 37) * 4.35)::DECIMAL(12,2), 2),
  round(((20.00 + (i % 37) * 4.35) * 0.10)::DECIMAL(12,2), 2),
  round(((20.00 + (i % 37) * 4.35) * 1.10)::DECIMAL(12,2), 2),
  CASE WHEN i % 17 = 0 THEN 'Manual review requested' WHEN i % 13 = 0 THEN '' ELSE NULL END,
  struct_pack(channel := CASE i % 3 WHEN 0 THEN 'web' WHEN 1 THEN 'mobile' ELSE 'store' END, priority := (i % 4)::INTEGER)
FROM range(1, 251) AS t(i);

CREATE TABLE main.order_items (
  order_id BIGINT NOT NULL,
  line_no INTEGER NOT NULL,
  sku VARCHAR NOT NULL,
  product_name VARCHAR NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10,2) NOT NULL,
  attributes MAP(VARCHAR, VARCHAR),
  PRIMARY KEY(order_id, line_no)
);

INSERT INTO main.order_items
SELECT
  order_id::BIGINT,
  line_no::INTEGER,
  'SKU-' || lpad((((order_id * 7 + line_no) % 60) + 1)::VARCHAR, 4, '0'),
  'Sample product ' || (((order_id * 7 + line_no) % 60) + 1)::VARCHAR,
  ((order_id + line_no) % 4 + 1)::INTEGER,
  round((5.25 + ((order_id * 3 + line_no) % 50) * 1.85)::DECIMAL(10,2), 2),
  map(['color', 'size'], [CASE (order_id + line_no) % 3 WHEN 0 THEN 'green' WHEN 1 THEN 'black' ELSE 'white' END, CASE line_no % 3 WHEN 0 THEN 'S' WHEN 1 THEN 'M' ELSE 'L' END])
FROM range(1, 251) AS o(order_id)
CROSS JOIN range(1, 3) AS l(line_no);

CREATE TABLE analytics.daily_sales (
  sales_date DATE PRIMARY KEY,
  order_count INTEGER NOT NULL,
  revenue DECIMAL(14,2) NOT NULL,
  conversion_rate DOUBLE,
  updated_at TIMESTAMP NOT NULL
);

INSERT INTO analytics.daily_sales
SELECT
  DATE '2025-01-01' + i::INTEGER,
  (30 + i % 17)::INTEGER,
  round((3400 + i * 73.41)::DECIMAL(14,2), 2),
  CASE WHEN i % 19 = 0 THEN NULL ELSE 0.018 + (i % 12) * 0.0015 END,
  TIMESTAMP '2025-01-02 06:00:00' + i * INTERVAL '1 day'
FROM range(0, 90) AS t(i);

CREATE TABLE main.empty_table (
  id INTEGER,
  memo VARCHAR,
  created_at TIMESTAMP
);

CREATE TABLE main."odd names" (
  "select" INTEGER,
  "日本語の列" VARCHAR,
  "a very long column name used to test layout" VARCHAR
);

INSERT INTO main."odd names" VALUES
  (1, 'こんにちは', 'Long values should stay inside their cells without breaking the page layout.'),
  (2, 'テスト', NULL),
  (3, 'DuckDB', 'Identifiers containing spaces and reserved words must be quoted safely.'),
  (4, '検索', 'Literal search sample: 100%_complete should match percent and underscore as ordinary characters.');


CREATE TABLE main.binary_samples (
  id INTEGER PRIMARY KEY,
  label VARCHAR NOT NULL,
  payload BLOB
);

INSERT INTO main.binary_samples VALUES
  (1, 'ASCII bytes', 'DuckDB'::BLOB),
  (2, 'Binary bytes', '\x00\x01\x7F\xAA\xFF'::BLOB),
  (3, 'NULL payload', NULL);

CREATE TABLE analytics.profile_cases (
  id INTEGER PRIMARY KEY,
  category VARCHAR,
  score DOUBLE,
  event_date DATE,
  all_null VARCHAR
);

INSERT INTO analytics.profile_cases
SELECT
  i::INTEGER,
  CASE WHEN i % 7 = 0 THEN NULL ELSE CASE i % 3 WHEN 0 THEN 'alpha' WHEN 1 THEN 'beta' ELSE 'gamma' END END,
  CASE WHEN i % 10 = 0 THEN NULL ELSE round((i * 1.75 + (i % 4) * 0.25)::DOUBLE, 2) END,
  DATE '2025-04-01' + i::INTEGER,
  NULL::VARCHAR
FROM range(1, 41) AS t(i);

CREATE VIEW main.customer_summary AS
SELECT
  c.customer_id,
  c.display_name,
  c.country,
  count(o.order_id)::BIGINT AS order_count,
  coalesce(sum(o.total), 0)::DECIMAL(16,2) AS order_total,
  max(o.ordered_at) AS latest_order_at
FROM main.customers c
LEFT JOIN main.orders o USING (customer_id)
GROUP BY c.customer_id, c.display_name, c.country;

CREATE VIEW analytics.recent_orders AS
SELECT
  o.order_id,
  o.ordered_at,
  o.status,
  o.total,
  c.display_name,
  c.country
FROM main.orders o
JOIN main.customers c USING (customer_id)
WHERE o.ordered_at >= TIMESTAMP '2025-01-15 00:00:00';

CHECKPOINT;
