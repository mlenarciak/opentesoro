# Performance measurements

These are reproducible local measurements, not a comparison with Agicap. There is no Agicap baseline, production load test, concurrency test, browser rendering benchmark, or end-to-end network latency claim.

## Environment and reproducibility

Recorded 12 November 2026 on Linux x64, Bun 1.3.13, Intel Xeon Gold 6226R at 2.90 GHz, 12 visible logical CPUs, approximately 45.85 GiB host RAM. Other work was running on this shared machine; results will vary.

```sh
bun packages/engine/benchmark.ts
bun scripts/benchmark-api.ts
```

The API script creates its own temporary directory and on-disk SQLite database with WAL enabled, seeds deterministic synthetic records in a database transaction using the real `Store.put` path, and removes only that owned fixture after closing it. It does not read your `.data` database or production records. Every insert retains normal audit and revision writes.

## Engine measurement

Dataset: 100,000 transactions, 10,000 outstanding obligations, one EUR account, an inclusive 365-day forecast, and 53 weekly output buckets. The engine is warmed before five timed runs. Data generation is excluded from the timed region.

Observed engine timings: **167.33, 165.82, 164.99, 156.56, 161.48 ms**, median **164.99 ms**. Peak process RSS: **333.70 MiB**, including fixture arrays and runtime/JIT memory. This is an engine-only measurement: no SQLite reads, JSON transport, browser, or network work.

## API request-handler measurement

Dataset: 100,000 bank transactions, 10,000 obligations, four EUR accounts, 365 forecast days, 53 weekly buckets. Data is synthetic and every cash amount is an integer number of cents.

The request handler benchmark includes actual SQLite queries and JSON decoding, engine calculations, response encoding, and the caller consuming and decoding the response JSON. It invokes `createApp` directly with a standard `Request`. **It does not include an HTTP socket, reverse proxy, TLS, WAN latency, or browser rendering.**

“Uncached forecast” means a fresh application forecast cache for each sample. The operating-system and SQLite pages remain warm after fixture creation; these are not cold-disk measurements. “Cached forecast” repeats the same query with an unchanged store revision. Mutations invalidate the forecast key through the revision value.

Initial baseline recorded at `2026-11-12T01:00:57.951Z`:

| Operation                                                          | Median wall time | Median user CPU | Median system CPU |
| ------------------------------------------------------------------ | ---------------: | --------------: | ----------------: |
| Uncached forecast, SQLite + engine + JSON                          |        403.70 ms |       467.36 ms |          69.02 ms |
| Cached forecast, response + JSON parsing                           |          0.29 ms |         0.48 ms |           0.00 ms |
| First 100 transactions, total count + JSON                         |         32.28 ms |        22.48 ms |           9.92 ms |
| First 100 transactions, text search + inflow filter + count + JSON |        323.92 ms |       221.59 ms |         109.22 ms |

User and system CPU are measured by `process.cpuUsage`; wall time is measured by `performance.now`. CPU medians are independent medians over the five samples, not CPU times for the median wall-time sample. Process CPU includes Bun runtime work on other threads and can exceed wall time.

The five wall-time samples for the baseline:

| Operation                 | Samples in milliseconds                |
| ------------------------- | -------------------------------------- |
| Uncached forecast         | 583.71, 508.58, 387.93, 403.70, 369.43 |
| Cached forecast           | 0.65, 0.30, 0.29, 0.24, 0.26           |
| Transaction page          | 33.44, 32.28, 32.81, 31.59, 31.47      |
| Searched transaction page | 323.92, 318.51, 330.21, 313.73, 323.98 |

Fixture creation took 2,119.47 ms wall, 1,595.02 ms user CPU, and 318.72 ms system CPU. Peak process RSS was **383.79 MiB**, including the fixture, audit records, JIT/runtime memory and all measured phases. This is a process-lifetime high-water mark, not the incremental memory cost of one request or a steady-state deployment memory estimate.

Checksums verify that the benchmark did real work:

```json
{
  "closingBalanceMinor": 165000000,
  "totalInflowMinor": 575000000,
  "totalOutflowMinor": 460000000,
  "periodCount": 53,
  "transactionPageTotal": 100000
}
```

## Measured lookup optimization

The final implementation stores a compact derived `record_lookup` table owned by `Store`. Searchable fields are Unicode NFKC normalized and lowercased with the Italian locale at write time. Queries use literal substring matching on separate description/counterparty/name fields, preserving accents and treating `%`, `_`, quotes, backslashes and boolean-looking text as ordinary characters. Amount, category, status and scope fields are projected at the same boundary so filtering does not repeatedly parse wide JSON payloads.

Substring counts scan the small projection sequentially. The selected page uses ordered indexes and joins only its selected canonical payloads. Canonical JSON, the projection, audit entries and revision updates are committed atomically. Migration version 4 backfills existing version-one databases without changing their financial payloads/audit/revisions and also cleans up local development projections. Schema version numbers need not be contiguous. Writes must use `Store` or the API; direct SQL inserts/updates bypass the supported projection and audit contract.

Final run recorded at `2026-11-12T01:14:59.677Z`, with identical synthetic dataset and checksum:

| Operation                                 | Initial median wall time | Final median wall time | Final median user CPU | Final median system CPU |
| ----------------------------------------- | -----------------------: | ---------------------: | --------------------: | ----------------------: |
| Uncached forecast, SQLite + engine + JSON |                403.70 ms |              473.40 ms |             438.26 ms |               139.47 ms |
| Cached forecast, response + JSON parsing  |                  0.29 ms |                0.54 ms |               0.39 ms |                 0.07 ms |
| First 100 transactions, count + JSON      |                 32.28 ms |                6.84 ms |               5.69 ms |                 1.88 ms |
| Searched inflow page, count + JSON        |                323.92 ms |               21.86 ms |              13.75 ms |                 8.92 ms |

Final five wall-time samples:

| Operation                 | Samples in milliseconds                |
| ------------------------- | -------------------------------------- |
| Uncached forecast         | 638.60, 473.40, 457.66, 468.34, 477.65 |
| Cached forecast           | 0.54, 0.27, 0.61, 0.35, 0.80           |
| Transaction page          | 8.57, 6.84, 7.06, 6.54, 6.42           |
| Searched transaction page | 22.29, 21.68, 21.86, 21.44, 21.95      |

The final audited fixture seed took **5,128.28 ms** wall, **4,120.17 ms** user CPU and **870.71 ms** system CPU. Peak process RSS was **419.49 MiB**. Search/page reads improved in this dataset, while projection maintenance makes bulk insertion slower than the original 2,119.47 ms seed. The final uncached forecast measurement was also slower than the initial run; no overall throughput or forecast-speed improvement is claimed. Shared-host variation, SQLite access patterns and runtime/GC work influence these timings.

A trigram FTS5 candidate was evaluated using the [official SQLite FTS5 documentation](https://sqlite.org/fts5.html#the_trigram_tokenizer). Its correctly ordered query measured 214.66 ms median on this broad-match workload, with 9,557.91 ms fixture insertion. The smaller ordinary-table projection was selected after measuring both query and write cost. Runtime search does not require FTS5. Short selective searches and much larger datasets could warrant revisiting a search index with a separate representative benchmark.

## Interpretation and next measurements

The observed difference between fresh and cached forecasts shows why an unchanged data revision can reuse a deterministic projection. It does not establish latency under simultaneous users or a frequently changing ledger.

Literal substring search still scans the compact projection to obtain an exact total, so it is linear in the inspected lookup rows. A 22 ms result at 100,000 synthetic transactions is not a guarantee at millions of rows, under concurrent mutations, or with different text distributions. The query deliberately preserves substring semantics instead of changing user searches to whole-word or prefix matching.

Before claiming production-scale performance, measure concurrent reads/writes, larger and skewed real-world datasets, incremental revision changes, deep pagination, backup/restore, process memory after sustained load, and the frontend with representative transaction counts. Keep financial correctness and isolation checks alongside any optimization.
