# Run and operate OpenTesoro

The initial deployment is one Bun process, one local SQLite database and a built browser application. It is a single-organization installation. Running the demo is different from safely operating real financial data.

## Local demo

Prerequisite: Bun **1.3.13 or newer**, as declared in `package.json`. From the repository root:

```sh
bun install --frozen-lockfile
bun run dev
```

Development starts the API on `http://127.0.0.1:3000` and Vite on `http://localhost:5173`. Vite proxies the API and OpenAPI document to port 3000. Defaults assume those ports; if you change the API port, update the development proxy too. The first run seeds fictional entities, accounts, transactions and travel bookings. The demo's reporting date is fixed at **2026-11-12** so its numbers remain reproducible.

For one-process use:

```sh
bun run build
bun run start
```

The server serves the built frontend when the expected `index.html` is present. `GET /health` checks basic HTTP readiness; it is not a statement about source freshness, backup safety or financial correctness. `GET /openapi.json` returns the API document.

## Empty installation

Use a new database path and disable demo seeding:

```sh
umask 077
OPENTESORO_DEMO=false DATABASE_PATH=.data/real-treasury.sqlite bun run start
```

Disabling demo seeding does **not** erase synthetic records in an existing database. A fresh path avoids mixing example records with business data. Set up an entity and account with its verified **closing end-of-day balance**, then import transactions after that snapshot and add outstanding obligations. A forecast must start after all included closing snapshots. See [API setup](api.md#minimal-setup).

`bun run seed` is an explicit demo initialization command and is not intended for a live empty installation. It preserves a database that already has entities, but that guard is not a substitute for selecting the intended file.

## Configuration

Copy `.env.example` to a local ignored `.env` if preferred; Bun loads environment configuration. Process environment/secret injection is suitable for services. Never commit a populated `.env`.

| Variable                                   | Default / purpose                                                                                                 |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `HOST`                                     | `127.0.0.1`; loopback by default                                                                                  |
| `PORT`                                     | `3000`                                                                                                            |
| `DATABASE_PATH`                            | `.data/opentesoro.sqlite` when started from the project root                                                      |
| `STATIC_DIR`                               | Optional built-client path; container sets `/app/apps/web/dist`                                                   |
| `OPENTESORO_DEMO`                          | Seeds synthetic examples unless exactly `false`; seeding occurs only when there are no entities                   |
| `OPENTESORO_API_TOKEN`                     | Full-access bearer token; required by the launcher when binding beyond loopback; at least 24 characters           |
| `OPENTESORO_READ_ONLY_TOKEN`               | Optional separate GET/HEAD token; configure only alongside a full-access token                                    |
| `ALLOWED_ORIGINS`                          | Comma-separated admitted browser mutation origins; development localhost origins by default                       |
| `AGICAP_CLIENT_ID`, `AGICAP_CLIENT_SECRET` | Optional credentials for code using the separate Agicap client; they do not automatically connect or migrate data |

Generate independent long random bearer values, for example with `openssl rand -hex 32`, then put them in your service's secret store/environment. The launcher rejects a reader token without a distinct writer token; a writer match has full authority. The initial bearer design has no user identity, per-person revocation, SSO or per-entity permissions.

## Hosting boundary

For an externally reachable service, configure the full-access token, terminate TLS at a trusted reverse proxy, preserve the intended application origin, and bind the upstream only where needed. Do not put bearer values in query strings or frontend build-time environment variables. The UI's token is held in session storage; browser-session security therefore matters.

The API treats entities as reporting perimeters in one trusted organization. It does not isolate unrelated tenants. A reader can read all data available through its endpoints. `ALLOWED_ORIGINS` is a mutation-admission list, not a general cross-origin response policy. For embedding in another project, a same-origin reverse proxy or server-side SDK integration is the simplest starting point.

Health and OpenAPI routes are public. The service's local database and audit contain sensitive business data; restrict filesystem access, logs, backups and the reverse proxy accordingly. No bank payment is executed by this release.

## Containers

The repository includes a `Dockerfile` and `compose.yaml`. The Compose configuration publishes the service on **host loopback**, mounts a named SQLite data volume, and requires `OPENTESORO_API_TOKEN` through environment substitution. Configure `.env` before using:

```sh
docker compose up --build -d
docker compose logs --tail=100 opentesoro
```

The in-container server binds all container interfaces, so the token is still required even though the host port is loopback. The default Compose demo setting remains `true`; use a new volume and `OPENTESORO_DEMO=false` for an empty installation. Do not delete an existing volume to switch modes. Token/volume/reverse-proxy settings should be reviewed for the target environment. Container build and runtime validation are recorded separately in [verification](verification.md); a checked-in Dockerfile alone is not evidence of a successful deployment.

## SQLite backups

The database runs in WAL mode. Copying only the main file while the server is writing can miss committed work; do not make that your live backup procedure. Keep SQLite on storage with appropriate local locking rather than a shared network filesystem. The [SQLite WAL documentation](https://www.sqlite.org/wal.html) explains the role of the WAL/SHM sidecars and local-host requirement.

For a live snapshot, use the SQLite command-line shell's online backup facility. The `sqlite3` command is an additional operator tool, not required by the application itself. Example using literal paths:

```sh
mkdir -p /srv/backups/opentesoro
sqlite3 .data/real-treasury.sqlite ".backup '/srv/backups/opentesoro/treasury-2026-11-12.sqlite'"
sqlite3 /srv/backups/opentesoro/treasury-2026-11-12.sqlite 'PRAGMA integrity_check;'
```

Run under an account that can read the live database and write the restricted backup directory. Check command exit status and require `integrity_check` to report `ok`. The [SQLite CLI](https://www.sqlite.org/cli.html) and [Online Backup API](https://www.sqlite.org/backup.html) describe this snapshot mechanism. Backup may wait on contention; schedule and monitor it. For a container volume, run a suitable SQLite backup tool against that mounted volume on the same host/container environment; the host-relative `.data` example does not automatically refer to a named Docker volume.

Restore into a **new empty directory** while the application is stopped, use a copy of the verified backup as the new `DATABASE_PATH`, and start with demo seeding disabled. Do not combine a restored main file with sidecar files from another database generation. Keep the previous database untouched until record counts, recent audit summaries, account balances and a known forecast agree. Test restoration periodically; integrity checks alone do not establish that an operator selected the correct source file.

The API JSON/CSV export is useful interchange but does not replace this complete database backup: metadata, idempotency history and audit state are outside the exported record collections. Encrypt off-host copies and apply the organization's retention policy.

## Upgrade and shutdown

Before an upgrade, make and verify a database backup, record the source revision/runtime, and test the new version with a copy. Schema version 4 is recorded. The initial release migrates original records into a compact derived search/filter projection; migration tests verify that payloads, revisions and audit history survive. Later migrations need their own tested transition and rollback procedure. There is not yet a rolling-upgrade migration service.

SIGINT/SIGTERM stop the HTTP server and close SQLite. A service manager should allow graceful shutdown before escalating. Keep one application writer per deployment unless concurrent-writer behavior has been explicitly tested for the workload. Synchronous SQLite and in-process caches are initial design choices, not horizontal-scaling guarantees.

## Checks and incident diagnosis

```sh
bun run typecheck
bun test
bun run verify:backup  # optional synthetic online-backup drill; requires sqlite3
bun run build
bun run benchmark
bun run benchmark:api
```

`bun run check` combines typecheck, tests and build. The benchmarks are separate: the engine measures synthetic in-process calculation; the API harness measures a bounded synthetic HTTP workload. Neither is an acceptance assertion for all hosts. Preserve the revision and measurement scope in reports.

When a request fails, retain its request ID, operation, timestamp and a redacted description. An HTTP 422 is commonly a validation/financial-boundary issue; inspect the problem detail. For a forecast cutoff error, check account snapshot dates and explicitly set `from` after them. For missing records, distinguish the paginated API from the 5,000-transaction bootstrap cap. For Agicap integration failures, consult the [read-only adapter documentation](../packages/agicap/README.md); the login session and Public API credentials are different authorization paths.
