# Test data

`browser-kitty-sample.duckdb` is generated from `browser-kitty-sample.sql` by `scripts/generate-test-data.ps1`.
The database intentionally covers the cases needed by DuckDB Explorer v1.0.0:

- schemas: `main`, `analytics`
- ordinary tables and views
- an empty table
- 250-row table for pagination
- `NULL` values
- `DATE`, `TIMESTAMP`, `BOOLEAN`, `DECIMAL`, `DOUBLE`, `BIGINT`
- nested values: `VARCHAR[]`, `STRUCT`, `MAP`
- BLOB values including non-text bytes and NULL
- identifiers containing spaces, a reserved word, and Japanese text
- long values that exercise responsive layouts
- literal `%` and `_` characters for search regression

Expected objects:

- `main.customers`
- `main.orders`
- `main.order_items`
- `main.empty_table`
- `main.odd names`
- `main.binary_samples`
- `main.customer_summary` (view)
- `analytics.daily_sales`
- `analytics.profile_cases`
- `analytics.recent_orders` (view)


### `analytics.profile_cases`

Dedicated column-analysis cases: low-cardinality text with NULLs, numeric values with NULLs, dates, and an all-NULL column.

## v1.0.0 regression cases

### Search

Open `main.odd names` and search for:

```text
100%_complete
```

Exactly the literal sample row should match. `%` and `_` must not behave as SQL LIKE wildcards.

### Filters

Open `main.customers`:

- `country` contains `Japan`
- `email` is NULL
- `email` is not NULL
- combine a free-text search and a filter and confirm both conditions apply

Open `main.orders`:

- `status` equals `paid`
- sort `order_id` descending
- move to another page and confirm the sort is retained

### Cell details

Open `main.binary_samples` and inspect the `payload` cells. The UI must not throw while showing binary values and the NULL payload must be visually distinct.

Open `main.order_items` and inspect a MAP value. Open `main.orders` and inspect a STRUCT value.

### Database overview and column analysis

After opening the fixture, confirm the overview appears before any table is selected and shows both `main` and `analytics` objects.

Open `analytics.profile_cases`, switch to Columns, and analyze:

- `category`: NULL rate plus common values `alpha` / `beta` / `gamma`
- `score`: min/max/average/median/quartiles and NULLs
- `event_date`: min/max date range
- `all_null`: 100% NULL and no common values

Also analyze `main.orders.status` for a low-cardinality text column and `main.binary_samples.payload` to confirm complex/BLOB analysis does not break the UI.

### Export

On a non-empty page:

- save visible rows as CSV
- save visible rows as JSON
- confirm the filename contains database/schema/relation/page
- confirm only the visible page is included
- confirm nested values serialize without throwing

Generate the database on Windows from the repository root:

```powershell
.\scripts\generate-test-data.ps1
```

The generator pins DuckDB CLI v1.4.0 so the fixture remains compatible with the standard DuckDB-Wasm baseline used during the validated pre-release product phase.

## Static regression check

```powershell
.\scripts\check-release.ps1
```

`build-standalone.bat` runs dependency resolution, fixture generation, release checks, pinned Builder runtime resolution, and the standalone build in order.

## v1.0.0 SQL regression cases

After generating `browser-kitty-sample.duckdb`, verify at least these SQL cases in the SQL view:

Allowed:

```sql
SELECT category, count(*) AS rows
FROM analytics.profile_cases
GROUP BY category
ORDER BY rows DESC;
```

```sql
WITH recent AS (
  SELECT order_id, ordered_at
  FROM main.orders
  ORDER BY ordered_at DESC
  LIMIT 10
)
SELECT * FROM recent;
```

```sql
DESCRIBE analytics.profile_cases;
```

The Explain button should work for the first two examples. Query history should remain available until another database file is opened. SQL result CSV/JSON exports must contain only the displayed result (maximum 1,000 rows).

Rejected before DuckDB execution:

```sql
UPDATE analytics.profile_cases SET score = 0;
DROP TABLE analytics.profile_cases;
ATTACH 'other.duckdb' AS other;
SELECT 1; SELECT 2;
```


## v1.0.0 comparison fixture

`browser-kitty-sample-after.sql` generates `browser-kitty-sample-after.duckdb`. Compare it with `browser-kitty-sample.duckdb`. It intentionally contains:

- added schema `archive`
- added tables `main.products` and `archive.closed_orders`
- removed `main.order_items`
- removed `analytics.recent_orders` view
- added `archive.customer_directory` view
- changed `main.customer_summary` view definition
- added `main.customers.vip`
- changed `main.customers.lifetime_value` from DECIMAL to DOUBLE
- changed `main.orders.total` precision
- removed `main.orders.note` and added `main.orders.source`
- nullability/default/type changes in several columns
- different table sizes for estimated-row regression checks

The fixture is designed for structural comparison only; exact record-level diffing is outside v1.0.0.

## DECIMAL display/export regression

In `main.orders`, row 1 has `DECIMAL(12,2)` values `subtotal = 24.35`, `tax = 2.44`, and `total = 26.79`. Verify the values in the table, cell/record details, visible-page CSV/JSON, and an equivalent read-only SQL result. JSON must use exact strings, not byte objects or rounded numbers. `ordered_at` retains the existing epoch-millisecond representation (`1735729200000`).

The automated pinned-Arrow tests also cover 38-digit precision, high scales, negative/zero/NULL values, sliced buffers, nested LIST/ARRAY/STRUCT/MAP decimals, and real BLOB values.
