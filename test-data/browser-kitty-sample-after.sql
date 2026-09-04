-- DuckDB Explorer v1.0.0 comparison fixture
-- Intended to be compared against browser-kitty-sample.duckdb.

CREATE SCHEMA analytics;
CREATE SCHEMA archive;

CREATE TABLE main.customers (
  customer_id BIGINT PRIMARY KEY,
  display_name VARCHAR NOT NULL,
  email VARCHAR NOT NULL,
  country VARCHAR NOT NULL,
  joined_on DATE NOT NULL,
  active BOOLEAN NOT NULL,
  lifetime_value DOUBLE NOT NULL,
  tags VARCHAR[],
  vip BOOLEAN DEFAULT false
);

INSERT INTO main.customers
SELECT
  i::BIGINT,
  'Customer ' || lpad(i::VARCHAR, 3, '0'),
  'customer' || i::VARCHAR || '@example.test',
  CASE i % 4 WHEN 0 THEN 'Japan' WHEN 1 THEN 'United States' WHEN 2 THEN 'Germany' ELSE 'Singapore' END,
  DATE '2024-01-01' + i::INTEGER,
  true,
  125.75 + i * 37.19,
  []::VARCHAR[],
  i % 10 = 0
FROM range(1, 131) AS t(i);

CREATE TABLE main.orders (
  order_id BIGINT PRIMARY KEY,
  customer_id BIGINT NOT NULL,
  ordered_at TIMESTAMP NOT NULL,
  status VARCHAR NOT NULL,
  subtotal DECIMAL(12,2) NOT NULL,
  tax DECIMAL(12,2) NOT NULL,
  total DECIMAL(14,2) NOT NULL,
  source VARCHAR DEFAULT 'web',
  metadata STRUCT(channel VARCHAR, priority INTEGER)
);

INSERT INTO main.orders
SELECT
  i::BIGINT,
  (((i - 1) % 130) + 1)::BIGINT,
  TIMESTAMP '2025-01-01 08:00:00' + i * INTERVAL '3 hours',
  CASE i % 4 WHEN 0 THEN 'paid' WHEN 1 THEN 'shipped' WHEN 2 THEN 'delivered' ELSE 'processing' END,
  20.00::DECIMAL(12,2),
  2.00::DECIMAL(12,2),
  22.00::DECIMAL(14,2),
  CASE i % 2 WHEN 0 THEN 'web' ELSE 'mobile' END,
  struct_pack(channel := 'web', priority := (i % 4)::INTEGER)
FROM range(1, 276) AS t(i);

CREATE TABLE analytics.daily_sales (
  sales_date DATE PRIMARY KEY,
  order_count BIGINT NOT NULL,
  revenue DECIMAL(14,2) NOT NULL,
  conversion_rate DOUBLE NOT NULL,
  updated_at TIMESTAMP NOT NULL
);

INSERT INTO analytics.daily_sales
SELECT DATE '2025-01-01' + i::INTEGER, (35 + i)::BIGINT, (3500 + i * 75)::DECIMAL(14,2), 0.025, TIMESTAMP '2025-01-02' + i * INTERVAL '1 day'
FROM range(0, 100) AS t(i);

CREATE TABLE main.empty_table (
  id INTEGER,
  memo VARCHAR,
  created_at DATE
);

CREATE TABLE main."odd names" (
  "select" INTEGER,
  "日本語の列" VARCHAR,
  "a very long column name used to test layout" VARCHAR
);

CREATE TABLE main.binary_samples (
  id INTEGER PRIMARY KEY,
  label VARCHAR NOT NULL,
  payload BLOB
);

CREATE TABLE analytics.profile_cases (
  id INTEGER PRIMARY KEY,
  category VARCHAR NOT NULL DEFAULT 'unknown',
  score DECIMAL(10,2),
  event_date DATE,
  all_null VARCHAR
);

CREATE TABLE main.products (
  product_id BIGINT PRIMARY KEY,
  sku VARCHAR NOT NULL,
  product_name VARCHAR NOT NULL,
  price DECIMAL(10,2) NOT NULL
);

INSERT INTO main.products
SELECT i, 'SKU-' || lpad(i::VARCHAR,4,'0'), 'Product ' || i::VARCHAR, (10 + i * 1.25)::DECIMAL(10,2)
FROM range(1, 21) AS t(i);

CREATE TABLE archive.closed_orders (
  order_id BIGINT,
  closed_on DATE,
  total DECIMAL(14,2)
);

CREATE VIEW main.customer_summary AS
SELECT
  c.customer_id,
  c.display_name,
  c.country,
  c.vip,
  count(o.order_id)::BIGINT AS order_count,
  coalesce(sum(o.total), 0)::DECIMAL(18,2) AS order_total
FROM main.customers c
LEFT JOIN main.orders o USING (customer_id)
GROUP BY c.customer_id, c.display_name, c.country, c.vip;

CREATE VIEW archive.customer_directory AS
SELECT customer_id, display_name, country, vip
FROM main.customers;

CHECKPOINT;
