import { z } from "zod";
import { timingSafeEqual, createHash, randomUUID } from "node:crypto";
import { resolve, sep } from "node:path";
import {
  buildForecast,
  buildAgingReport,
  suggestReconciliation,
  reconcilePayment,
  addDays,
  addMinor,
  applyBasisPoints,
  categorizeTransaction,
  type Account,
  type Transaction,
  type Obligation,
  type Scenario,
  type Settlement,
} from "@opentesoro/engine";
import { Store, collections, type Collection, type RecordData } from "./store";
import { schemas, date } from "./validation";
import { previewCsv, exportCsv } from "./csv";
import { scheduleBooking } from "./demo";
import { ensureReferenceData } from "./reference";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export interface AppOptions {
  token?: string;
  readOnlyToken?: string;
  staticDir?: string;
  allowedOrigins?: string[];
}
const validKind = (s: string): s is Collection =>
  collections.includes(s as Collection);
function safeToken(a: string, b: string) {
  const aa = Buffer.from(a),
    bb = Buffer.from(b);
  return aa.length === bb.length && timingSafeEqual(aa, bb);
}
const json = (data: unknown, status = 200) => Response.json(data, { status });
function requireRecord(
  store: Store,
  kind: Collection,
  id: unknown,
): RecordData {
  const record = typeof id === "string" ? store.get(kind, id) : undefined;
  if (!record) throw new HttpError(404, `${kind}: record not found`);
  return record;
}
function checkRelations(store: Store, kind: Collection, row: RecordData) {
  if (kind === "entities" || kind === "scenarios") return;
  if (row.entityId) requireRecord(store, "entities", row.entityId);
  if (row.accountId) {
    const a = requireRecord(store, "accounts", row.accountId);
    if (a.entityId !== row.entityId)
      throw new HttpError(422, "Account belongs to a different entity");
  }
  if (row.categoryId) {
    const category = requireRecord(store, "categories", row.categoryId);
    if (
      row.amountMinor &&
      category.direction !== "both" &&
      category.direction !==
        (Number(row.amountMinor) > 0 ? "inflow" : "outflow")
    )
      throw new HttpError(422, "Category has incompatible cash direction");
  }
  if (row.parentId) {
    if (row.parentId === row.id)
      throw new HttpError(422, "Category cannot parent itself");
    let parent = requireRecord(store, "categories", row.parentId);
    const visited = new Set([row.id]);
    while (parent) {
      if (visited.has(parent.id))
        throw new HttpError(422, "Category hierarchy contains a cycle");
      visited.add(parent.id);
      if (!parent.parentId) break;
      parent = requireRecord(store, "categories", parent.parentId);
    }
  }
  if (row.bookingId) {
    const b = requireRecord(store, "bookings", row.bookingId);
    if (b.entityId !== row.entityId)
      throw new HttpError(422, "Booking belongs to a different entity");
  }
}
function assertMutable(
  store: Store,
  kind: Collection,
  row: RecordData,
  before?: RecordData,
) {
  if (!before) return;
  if (kind === "entities" && row.currency !== before.currency)
    throw new HttpError(409, "Entity currency cannot change");
  if (
    kind === "accounts" &&
    row.entityId !== before.entityId &&
    (["transactions", "obligations", "bookings"] as const).some((table) =>
      store.list<RecordData>(table).some((x) => x.accountId === row.id),
    )
  )
    throw new HttpError(409, "An account with transactions cannot move entity");
  const settlements = store.list<Settlement>("settlements");
  if (
    kind === "transactions" &&
    settlements.some((x) => x.transactionId === row.id)
  )
    for (const field of [
      "amountMinor",
      "entityId",
      "accountId",
      "date",
      "transferId",
    ])
      if (row[field] !== before[field])
        throw new HttpError(
          409,
          "Reconciled transaction financial fields are immutable",
        );
  if (kind === "categories" && row.direction !== before.direction) {
    for (const kind of ["transactions", "obligations"] as const)
      if (
        store
          .list(kind)
          .some(
            (x) =>
              x.categoryId === row.id &&
              row.direction !== "both" &&
              row.direction !==
                (Number(x.amountMinor) > 0 ? "inflow" : "outflow"),
          )
      )
        throw new HttpError(
          409,
          "Category direction conflicts with existing cash flows",
        );
  }
  if (kind === "obligations") {
    if (row.bookingId !== before.bookingId)
      throw new HttpError(409, "Booking schedule ownership cannot change");
    if (row.settledMinor !== before.settledMinor)
      throw new HttpError(
        409,
        "Use the reconciliation endpoint to change settlement amounts",
      );
    if (Number(before.settledMinor) > 0)
      for (const field of ["amountMinor", "entityId", "accountId"])
        if (row[field] !== before[field])
          throw new HttpError(
            409,
            "Partially settled obligation financial fields are immutable",
          );
  }
}
function assertDeletable(store: Store, kind: Collection, row: RecordData) {
  const references: Partial<Record<Collection, [Collection, string][]>> = {
    entities: [
      ["accounts", "entityId"],
      ["transactions", "entityId"],
      ["obligations", "entityId"],
      ["bookings", "entityId"],
    ],
    accounts: [
      ["transactions", "accountId"],
      ["obligations", "accountId"],
      ["bookings", "accountId"],
    ],
    categories: [
      ["transactions", "categoryId"],
      ["obligations", "categoryId"],
      ["rules", "categoryId"],
      ["categories", "parentId"],
    ],
    transactions: [["settlements", "transactionId"]],
    obligations: [["settlements", "obligationId"]],
  };
  for (const [table, field] of references[kind] ?? [])
    if (store.list(table).some((x) => x[field] === row.id))
      throw new HttpError(
        409,
        "Record is referenced by existing financial data",
      );
  if (kind === "bookings")
    throw new HttpError(
      409,
      "Cancel bookings instead of deleting their schedule",
    );
}
export function createApp(store: Store, options: AppOptions = {}) {
  ensureReferenceData(store);
  const forecastCache = new Map<string, unknown>();
  const readJson = async (req: Request) => {
    const text = await req.text();
    if (Buffer.byteLength(text) > 2_500_000)
      throw new HttpError(413, "Request exceeds 2.5 MB");
    try {
      return JSON.parse(text);
    } catch {
      throw new HttpError(400, "Malformed JSON");
    }
  };
  return async function handle(req: Request): Promise<Response> {
    const requestId = randomUUID();
    let response: Response;
    try {
      const url = new URL(req.url),
        path = url.pathname,
        method = req.method;
      const api = path.startsWith("/api/");
      if (method === "GET" && path === "/health")
        return json({
          status: "ok",
          version: "0.1.0",
          schemaVersion: Number(
            (
              store.db
                .query("SELECT max(version) AS version FROM schema_migrations")
                .get() as { version: number }
            ).version,
          ),
        });
      if (method === "GET" && path === "/openapi.json") {
        const { openApiDocument } = await import("./openapi");
        return json(openApiDocument);
      }
      if (!api) {
        if (!options.staticDir)
          return new Response(
            "OpenTesoro API is running. Start the web UI with bun dev, or bun run build then bun start.",
            { headers: { "content-type": "text/plain;charset=utf-8" } },
          );
        const base = resolve(options.staticDir),
          filePath = resolve(base, "." + decodeURIComponent(path));
        if (filePath !== base && !filePath.startsWith(base + sep))
          throw new HttpError(403, "Invalid asset path");
        const file = Bun.file(filePath);
        if (await file.exists())
          return new Response(file, {
            headers: {
              "cache-control": path.startsWith("/assets/")
                ? "public,max-age=31536000,immutable"
                : "no-cache",
            },
          });
        if (path.includes("."))
          return new Response("Not found", { status: 404 });
        return new Response(Bun.file(resolve(base, "index.html")), {
          headers: { "cache-control": "no-cache" },
        });
      }
      let actor = "local";
      if (options.token) {
        const credential =
          req.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
        if (safeToken(credential, options.token)) actor = "api";
        else if (
          options.readOnlyToken &&
          safeToken(credential, options.readOnlyToken)
        ) {
          actor = "reader";
          if (!["GET", "HEAD"].includes(method))
            throw new HttpError(403, "Read-only token cannot modify data");
        } else throw new HttpError(401, "Bearer token required");
      }
      if (!["GET", "HEAD"].includes(method)) {
        const origin = req.headers.get("origin");
        if (
          origin &&
          origin !== url.origin &&
          !(options.allowedOrigins ?? []).includes(origin)
        )
          throw new HttpError(403, "Cross-origin mutation rejected");
        if (req.headers.get("sec-fetch-site") === "cross-site")
          throw new HttpError(403, "Cross-site mutation rejected");
        if (
          !req.headers.get("content-type")?.includes("application/json") &&
          method !== "DELETE"
        )
          throw new HttpError(415, "Use application/json");
      }
      const prefix = "/api/v1";
      if (!path.startsWith(prefix + "/"))
        throw new HttpError(404, "Unknown API version");
      const route = path.slice(prefix.length),
        parts = route
          .split("/")
          .filter(Boolean)
          .map((part) => {
            try {
              return decodeURIComponent(part);
            } catch {
              throw new HttpError(400, "Malformed URL identifier");
            }
          });
      const asOf = String(
        (
          store.db
            .query("SELECT value FROM metadata WHERE key='asOfDate'")
            .get() as { value: string } | null
        )?.value ?? new Date().toISOString().slice(0, 10),
      );
      const entityId = url.searchParams.get("entityId") || undefined;
      if (entityId) requireRecord(store, "entities", entityId);
      const filtered = <T extends { entityId: string }>(rows: T[]) =>
        entityId ? rows.filter((x) => x.entityId === entityId) : rows;
      if (method === "GET" && route === "/bootstrap") {
        const transactionPage = store.page("transactions", {
          entityId,
          limit: 1,
          offset: 0,
        });
        const transactions = store
          .list<Transaction>("transactions", {
            entityId,
            limit: 5000,
            descending: true,
          })
          .reverse();
        response = json({
          version: "0.1.0",
          asOfDate: asOf,
          demo:
            (
              store.db
                .query("SELECT value FROM metadata WHERE key='demo'")
                .get() as { value: string } | null
            )?.value === "true",
          revision: store.revision(),
          entities: store.list("entities"),
          accounts: filtered(store.list<Account>("accounts")),
          categories: store.list("categories"),
          transactions,
          transactionsTotal: transactionPage.total,
          obligations: filtered(store.list<Obligation>("obligations")),
          scenarios: store.list("scenarios"),
          bookings: filtered(
            store.list<RecordData & { entityId: string }>("bookings"),
          ),
          rules: store.list("rules"),
          settlements: store.list("settlements"),
        });
      } else if (method === "GET" && route === "/forecast") {
        const snapshots = store
          .list<Account>("accounts")
          .filter((a) => a.enabled && (!entityId || a.entityId === entityId))
          .map((a) => a.asOfDate)
          .sort();
        const defaultFrom = snapshots.length
          ? addDays(snapshots.at(-1)!, 1)
          : asOf;
        const from = date.parse(url.searchParams.get("from") ?? defaultFrom),
          to = date.parse(url.searchParams.get("to") ?? addDays(from, 180));
        const granularity = z
          .enum(["day", "week", "month"])
          .parse(url.searchParams.get("granularity") ?? "month");
        const scenarioId = url.searchParams.get("scenarioId") || undefined;
        const key = JSON.stringify([
          store.revision(),
          from,
          to,
          granularity,
          scenarioId,
          entityId,
        ]);
        let result = forecastCache.get(key);
        if (!result) {
          result = buildForecast({
            accounts: store.list<Account>("accounts"),
            transactions: store.list<Transaction>("transactions"),
            obligations: store.list<Obligation>("obligations"),
            from,
            to,
            granularity,
            scenario: scenarioId
              ? (requireRecord(
                  store,
                  "scenarios",
                  scenarioId,
                ) as unknown as Scenario)
              : undefined,
            entityIds: entityId ? [entityId] : undefined,
          });
          if (forecastCache.size >= 32) forecastCache.clear();
          forecastCache.set(key, result);
        }
        response = json(result);
      } else if (method === "GET" && route === "/dashboard") {
        const accounts = filtered(store.list<Account>("accounts")),
          transactions = filtered(store.list<Transaction>("transactions")),
          obligations = filtered(store.list<Obligation>("obligations"));
        let balance = 0;
        const accountBalances = accounts.map((a) => {
          let currentBalanceMinor = a.balanceMinor;
          for (const t of transactions)
            if (t.accountId === a.id && t.date > a.asOfDate && t.date <= asOf)
              currentBalanceMinor = addMinor(
                currentBalanceMinor,
                t.amountMinor,
              );
          if (a.enabled) balance = addMinor(balance, currentBalanceMinor);
          return { id: a.id, currentBalanceMinor };
        });
        response = json({
          asOfDate: asOf,
          currency: "EUR",
          balanceMinor: balance,
          accounts: accountBalances,
          receivables: buildAgingReport(obligations, asOf, "receivable"),
          payables: buildAgingReport(obligations, asOf, "payable"),
          uncategorizedCount: transactions.filter((x) => !x.categoryId).length,
          accountCount: accounts.filter((x) => x.enabled).length,
        });
      } else if (method === "GET" && route === "/audit") {
        response = json({ items: store.audit(100) });
      } else if (method === "GET" && route === "/export") {
        const format = url.searchParams.get("format") ?? "json";
        if (format === "csv") {
          const tx = filtered(store.list<Transaction>("transactions"));
          response = new Response(
            exportCsv(tx as unknown as Record<string, unknown>[], [
              "id",
              "entityId",
              "accountId",
              "date",
              "amountMinor",
              "description",
              "counterparty",
              "categoryId",
              "externalId",
            ]),
            {
              headers: {
                "content-type": "text/csv;charset=utf-8",
                "content-disposition":
                  'attachment; filename="opentesoro-transactions.csv"',
              },
            },
          );
        } else if (format === "json")
          response = json({
            format: "opentesoro/1",
            exportedAt: new Date().toISOString(),
            data: Object.fromEntries(
              collections.map((kind) => [kind, store.list(kind)]),
            ),
          });
        else throw new HttpError(422, "Unsupported export format");
      } else if (method === "POST" && route === "/import/preview") {
        const body = z
          .object({ csv: z.string().max(2 * 1024 * 1024) })
          .parse(await readJson(req));
        response = json(previewCsv(body.csv));
      } else if (method === "POST" && route === "/import/commit") {
        const body = z
          .object({
            csv: z.string().max(2 * 1024 * 1024),
            accountId: z.string().min(1),
          })
          .parse(await readJson(req));
        const account = requireRecord(store, "accounts", body.accountId);
        const preview = previewCsv(body.csv);
        if (preview.errors.length)
          throw new HttpError(
            422,
            `Import is atomic: ${preview.errors.length} invalid rows. Preview and correct before committing.`,
          );
        const result = store.atomic(() => {
          let imported = 0,
            duplicates = 0;
          for (const row of preview.rows) {
            const existing = store.db
              .query(
                "SELECT payload FROM records WHERE collection='transactions' AND account_id=? AND external_key=?",
              )
              .get(body.accountId, row.externalId) as {
              payload: string;
            } | null;
            if (existing) {
              const old = JSON.parse(existing.payload);
              if (
                old.date !== row.date ||
                old.amountMinor !== row.amountMinor ||
                old.description !== row.description
              )
                throw new HttpError(
                  409,
                  "An imported external reference has conflicting financial data",
                );
              duplicates++;
              continue;
            }
            const tx = schemas.transactions.parse({
              id: randomUUID(),
              entityId: account.entityId,
              accountId: body.accountId,
              ...row,
            });
            store.put("transactions", tx, actor);
            imported++;
          }
          return { imported, duplicates, totalRows: preview.totalRows };
        });
        response = json(result, 201);
      } else if (method === "GET" && route === "/reconciliation/suggestions") {
        const transaction = requireRecord(
          store,
          "transactions",
          url.searchParams.get("transactionId"),
        ) as unknown as Transaction;
        response = json({
          items: suggestReconciliation(
            transaction,
            store.list<Obligation>("obligations"),
            store.list<Settlement>("settlements"),
          ),
        });
      } else if (method === "POST" && route === "/reconciliation") {
        const body = z
          .object({
            transactionId: z.string(),
            obligationId: z.string(),
            amountMinor: z.number().int().positive(),
          })
          .parse(await readJson(req));
        const result = store.atomic(() => {
          const result = reconcilePayment({
            transaction: requireRecord(
              store,
              "transactions",
              body.transactionId,
            ) as unknown as Transaction,
            obligation: requireRecord(
              store,
              "obligations",
              body.obligationId,
            ) as unknown as Obligation,
            amountMinor: body.amountMinor,
            settlementId: randomUUID(),
            settlements: store.list<Settlement>("settlements"),
          });
          store.put(
            "obligations",
            result.obligation as unknown as RecordData,
            actor,
          );
          store.put(
            "settlements",
            result.settlement as unknown as RecordData,
            actor,
          );
          return result;
        });
        response = json(result, 201);
      } else if (method === "POST" && route === "/rules/apply") {
        const result = store.atomic(() => {
          const rules = store
            .list("rules")
            .filter((r) => r.enabled)
            .sort(
              (a, b) =>
                Number(a.priority) - Number(b.priority) ||
                a.id.localeCompare(b.id),
            );
          let updated = 0;
          for (const tx of store.list("transactions")) {
            if (tx.categoryId || tx.transferId) continue;
            const haystack =
              `${tx.description} ${tx.counterparty}`.toLocaleLowerCase("it-IT");
            const match = categorizeTransaction(
              { ...tx, description: haystack } as unknown as Transaction,
              rules.map((r) => ({
                id: r.id,
                name: String(r.name),
                priority: Number(r.priority),
                enabled: !!r.enabled,
                categoryId: String(r.categoryId),
                conditions: {
                  descriptionIncludes: String(r.contains),
                  direction:
                    r.direction === "both"
                      ? undefined
                      : (r.direction as "inflow" | "outflow"),
                },
              })),
            );
            if (match) {
              const next = { ...tx, categoryId: match.categoryId };
              checkRelations(store, "transactions", next);
              store.put("transactions", next, actor);
              updated++;
            }
          }
          return { updated };
        });
        response = json(result);
      } else if (validKind(parts[0] ?? "") && parts.length <= 2) {
        const kind = parts[0] as Collection,
          id = parts[1];
        if (kind === "settlements" && !["GET", "HEAD"].includes(method))
          throw new HttpError(
            405,
            "Settlements are created through reconciliation",
          );
        if (method === "GET") {
          if (id) response = json(requireRecord(store, kind, id));
          else {
            const limit = z.coerce
                .number()
                .int()
                .min(1)
                .max(1000)
                .parse(url.searchParams.get("limit") ?? 100),
              offset = z.coerce
                .number()
                .int()
                .min(0)
                .max(1000000)
                .parse(url.searchParams.get("offset") ?? 0);
            response = json(
              store.page(kind, {
                entityId: [
                  "entities",
                  "categories",
                  "scenarios",
                  "rules",
                  "settlements",
                ].includes(kind)
                  ? undefined
                  : entityId,
                limit,
                offset,
                accountId: url.searchParams.get("accountId") ?? undefined,
                categoryId: url.searchParams.get("categoryId") ?? undefined,
                status: url.searchParams.get("status") ?? undefined,
                search: url.searchParams.get("search") ?? undefined,
                direction: z
                  .enum(["inflow", "outflow"])
                  .optional()
                  .parse(url.searchParams.get("direction") || undefined),
              }),
            );
          }
        } else if ((method === "POST" && !id) || (method === "PATCH" && id)) {
          const body = await readJson(req);
          const before = id ? requireRecord(store, kind, id) : undefined;
          if (!body || typeof body !== "object" || Array.isArray(body))
            throw new HttpError(422, "Expected a JSON object");
          if (body.categoryId === null) body.categoryId = undefined;
          const row = schemas[kind].parse({
            ...before,
            ...body,
            id: id ?? body.id ?? randomUUID(),
          }) as RecordData;
          if (kind === "obligations" && !before && row.settledMinor !== 0)
            throw new HttpError(
              422,
              "New obligations must have zero settlements",
            );
          const rawKey = req.headers.get("idempotency-key");
          const key =
            rawKey === null
              ? undefined
              : z.string().min(1).max(200).parse(rawKey);
          const hash = createHash("sha256")
            .update(JSON.stringify([method, path, body]))
            .digest("hex");
          const result = store.atomic(() => {
            if (key) {
              const cached = store.db
                .query("SELECT hash,result FROM idempotency WHERE key=?")
                .get(key) as { hash: string; result: string } | null;
              if (cached) {
                if (cached.hash !== hash)
                  throw new HttpError(
                    409,
                    "Idempotency key reused with different request",
                  );
                return JSON.parse(cached.result);
              }
            }
            if (!id && store.get(kind, row.id))
              throw new HttpError(409, "ID already exists");
            checkRelations(store, kind, row);
            assertMutable(store, kind, row, before);
            if (kind === "bookings") {
              if (before && JSON.stringify(before) === JSON.stringify(row))
                return before;
              const old = store
                .list<RecordData>("obligations")
                .filter((x) => x.bookingId === row.id);
              if (
                old.some((x) => Number(x.settledMinor) > 0) &&
                JSON.stringify(before) !== JSON.stringify(row)
              )
                throw new HttpError(
                  409,
                  "Booking has payments; adjust outstanding obligations instead",
                );
              for (const obligation of old)
                store.remove("obligations", obligation.id, actor);
              store.put(kind, row, actor);
              if (row.status !== "cancelled")
                for (const obligation of scheduleBooking(row)) {
                  if (store.get("obligations", obligation.id))
                    throw new HttpError(
                      409,
                      "Generated installment ID belongs to an existing obligation",
                    );
                  const admitted = schemas.obligations.parse(
                    obligation,
                  ) as RecordData;
                  checkRelations(store, "obligations", admitted);
                  store.put("obligations", admitted, actor);
                }
            } else store.put(kind, row, actor);
            if (key)
              store.db
                .query("INSERT INTO idempotency VALUES(?,?,?,?)")
                .run(key, hash, JSON.stringify(row), new Date().toISOString());
            return row;
          });
          response = json(result, id ? 200 : 201);
        } else if (method === "DELETE" && id) {
          store.atomic(() => {
            const row = requireRecord(store, kind, id);
            assertDeletable(store, kind, row);
            store.remove(kind, id, actor);
          });
          response = new Response(null, { status: 204 });
        } else throw new HttpError(405, "Method not supported");
      } else throw new HttpError(404, "Endpoint not found");
    } catch (error) {
      const status =
        error instanceof HttpError
          ? error.status
          : error instanceof z.ZodError ||
              error instanceof RangeError ||
              error instanceof TypeError
            ? 422
            : error instanceof Error && /UNIQUE constraint/.test(error.message)
              ? 409
              : 500;
      const detail =
        status === 500
          ? "Unexpected server error"
          : error instanceof z.ZodError
            ? error.issues
                .map((i) => `${i.path.join(".")}: ${i.message}`)
                .join(";")
            : error instanceof Error
              ? error.message
              : "Invalid request";
      if (status === 500) console.error(`[${requestId}]`, error);
      response = new Response(
        JSON.stringify({
          type: `https://opentesoro.dev/problems/${status}`,
          title: status === 500 ? "Internal server error" : "Request failed",
          status,
          detail,
          requestId,
        }),
        { status, headers: { "content-type": "application/problem+json" } },
      );
    }
    response.headers.set("x-request-id", requestId);
    response.headers.set("x-content-type-options", "nosniff");
    response.headers.set("referrer-policy", "same-origin");
    response.headers.set("cache-control", "no-store");
    return response;
  };
}
