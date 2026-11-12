import { afterEach, describe, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store, type RecordData } from "./store";
const stores = new Set<Store>(),
  directories: string[] = [];
afterEach(() => {
  for (const store of stores) store.close();
  stores.clear();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function makeStore(path = ":memory:") {
  const store = new Store(path);
  stores.add(store);
  return store;
}
const row = (
  id: string,
  description: string,
  overrides: Record<string, unknown> = {},
): RecordData => ({
  id,
  description,
  counterparty: "Synthetic customer",
  entityId: "operator",
  accountId: "bank",
  date: "2026-02-01",
  amountMinor: 10_000,
  ...overrides,
});
function search(
  store: Store,
  text: string,
  options: Partial<Parameters<Store["page"]>[1]> = {},
) {
  return store.page("transactions", {
    search: text,
    limit: 100,
    offset: 0,
    ...options,
  });
}
const ids = (result: ReturnType<Store["page"]>) =>
  (result.items as RecordData[]).map((x) => x.id);
describe("persistent literal substring search", () => {
  test("Italian Unicode normalization and case-insensitive accented substrings", () => {
    const store = makeStore();
    store.put(
      "transactions",
      row("italian", "Acconto CITTÀ DI LECCE", {
        counterparty: "Élite Vacanze",
      }),
    );
    expect(ids(search(store, "città"))).toEqual(["italian"]);
    expect(ids(search(store, "CITTA\u0300"))).toEqual(["italian"]);
    expect(ids(search(store, "élite"))).toEqual(["italian"]);
    expect(ids(search(store, "À D"))).toEqual(["italian"]);
    expect(ids(search(store, "citta"))).toEqual([]); // Diacritics remain literal; no accent-stripping guess.
  });
  test("percent, underscore, quotes and backslashes are literal data in indexed and short paths", () => {
    const store = makeStore();
    store.put(
      "transactions",
      row("literal", 'Sconto 50% pratica_A, Hotel "Rossi" A\\B'),
    );
    store.put(
      "transactions",
      row("other", "Sconto 500 praticaZA, Hotel Rossi AXB"),
    );
    for (const term of ["50%", "ca_A", '"Rossi"', "A\\B", "%", "_", '"'])
      expect(ids(search(store, term))).toEqual(["literal"]);
  });
  test("boolean operators and punctuation remain literal data", () => {
    const store = makeStore();
    store.put(
      "transactions",
      row("literal", "Pagamento (hotel OR bus) + quota*"),
    );
    store.put("transactions", row("decoy", "Pagamento hotel e bus quota"));
    expect(ids(search(store, "hotel OR bus"))).toEqual(["literal"]);
    expect(ids(search(store, "quota*"))).toEqual(["literal"]);
    expect(ids(search(store, "(hotel"))).toEqual(["literal"]);
    expect(ids(search(store, '" OR "'))).toEqual([]);
  });
  test("short strings use the same literal substring semantics as longer queries", () => {
    const store = makeStore();
    store.put("transactions", row("short", "Saldo AB · città"));
    expect(ids(search(store, "a"))).toEqual(["short"]);
    expect(ids(search(store, "AB"))).toEqual(["short"]);
    expect(ids(search(store, "à"))).toEqual(["short"]);
    expect(ids(search(store, "zz"))).toEqual([]);
  });
  test("substrings do not join across distinct fields", () => {
    const store = makeStore();
    store.put(
      "transactions",
      row("separate", "Pagamento cliente", { counterparty: "Rossi" }),
    );
    expect(ids(search(store, "cliente rossi"))).toEqual([]);
    expect(ids(search(store, "cliente"))).toEqual(["separate"]);
    expect(ids(search(store, "rossi"))).toEqual(["separate"]);
  });
  test("emoji sequences and control-character substrings stay exact", () => {
    const store = makeStore();
    store.put(
      "transactions",
      row("unicode", "Viaggio 🌞🌊🏖️ quota\nconfermata"),
    );
    expect(ids(search(store, "🌞🌊🏖"))).toEqual(["unicode"]);
    expect(ids(search(store, "quota\nconfermata"))).toEqual(["unicode"]);
  });
  test("collection, entity, account, direction and category filters preserve totals and stable order", () => {
    const store = makeStore();
    store.put(
      "transactions",
      row("b", "Hotel Salento", {
        date: "2026-02-03",
        amountMinor: -100,
        categoryId: "supplier",
      }),
    );
    store.put(
      "transactions",
      row("a", "Hotel Salento", {
        date: "2026-02-03",
        amountMinor: -100,
        categoryId: "supplier",
      }),
    );
    store.put(
      "transactions",
      row("old", "Hotel Salento", {
        date: "2026-02-01",
        amountMinor: -100,
        categoryId: "supplier",
      }),
    );
    store.put(
      "transactions",
      row("other-entity", "Hotel Salento", {
        entityId: "another",
        amountMinor: -100,
        categoryId: "supplier",
      }),
    );
    store.put(
      "transactions",
      row("other-account", "Hotel Salento", {
        accountId: "another",
        amountMinor: -100,
        categoryId: "supplier",
      }),
    );
    store.put("transactions", row("positive", "Hotel Salento"));
    store.put("obligations", {
      ...row("wrong-collection", "Hotel Salento"),
      dueDate: "2026-02-01",
      status: "open",
    });
    const result = search(store, "salento", {
      entityId: "operator",
      accountId: "bank",
      direction: "outflow",
      categoryId: "supplier",
      limit: 1,
      offset: 1,
    });
    expect(result.total).toBe(3);
    expect(ids(result)).toEqual(["b"]);
    const uncategorized = search(store, "salento", {
      categoryId: "uncategorized",
      direction: "inflow",
    });
    expect(ids(uncategorized)).toEqual(["positive"]);
  });
  test("non-transaction collection status filtering and ascending dates are unchanged", () => {
    const store = makeStore();
    for (const [id, date, status] of [
      ["later", "2026-03-01", "open"],
      ["earlier", "2026-02-01", "open"],
      ["cancelled", "2026-01-01", "cancelled"],
    ])
      store.put("obligations", {
        id,
        entityId: "operator",
        dueDate: date,
        description: "Saldo hotel",
        amountMinor: -100,
        status,
      });
    const result = store.page("obligations", {
      search: "hotel",
      status: "open",
      limit: 10,
      offset: 0,
    });
    expect(ids(result)).toEqual(["earlier", "later"]);
    expect(result.total).toBe(2);
  });
  test("updates and deletes maintain search projection transactionally", () => {
    const store = makeStore();
    store.put("transactions", row("editable", "Acconto hotel"));
    expect(ids(search(store, "hotel"))).toEqual(["editable"]);
    store.put("transactions", row("editable", "Acconto trasporto"));
    expect(ids(search(store, "hotel"))).toEqual([]);
    expect(ids(search(store, "trasporto"))).toEqual(["editable"]);
    store.remove("transactions", "editable");
    expect(ids(search(store, "trasporto"))).toEqual([]);
  });
  test("failed financial transaction rolls back canonical record, projections, audit and revision", () => {
    const store = makeStore();
    store.put("transactions", row("original", "Pagamento hotel"));
    const revision = store.revision(),
      audit = store.audit().length;
    expect(() =>
      store.atomic(() => {
        store.put("transactions", row("original", "Pagamento volo"));
        store.put("transactions", row("new", "Nuovo volo"));
        throw new Error("Rollback fixture");
      }),
    ).toThrow("Rollback fixture");
    expect(ids(search(store, "hotel"))).toEqual(["original"]);
    expect(ids(search(store, "volo"))).toEqual([]);
    expect(store.get("transactions", "new")).toBeUndefined();
    expect(store.revision()).toBe(revision);
    expect(store.audit()).toHaveLength(audit);
  });
  test("name fields are searchable without exposing derived columns in canonical payloads", () => {
    const store = makeStore();
    const entity = { id: "italy", name: "CITTÀ Travel", currency: "EUR" };
    store.put("entities", entity);
    expect(
      ids(store.page("entities", { search: "città", limit: 10, offset: 0 })),
    ).toEqual(["italy"]);
    expect(store.get("entities", "italy")).toEqual(entity);
  });
  test("version-one database is backfilled once and search survives persistent reopen", () => {
    const dir = mkdtempSync(join(tmpdir(), "opentesoro-search-migration-"));
    directories.push(dir);
    const path = join(dir, "legacy.sqlite");
    const old = new Database(path, { create: true });
    old.exec(
      `CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);INSERT INTO schema_migrations VALUES(1,'legacy');CREATE TABLE records(collection TEXT NOT NULL,id TEXT NOT NULL,entity_id TEXT,account_id TEXT,date TEXT,external_key TEXT,payload TEXT NOT NULL CHECK(json_valid(payload)),revision INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(collection,id));CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT INTO metadata VALUES('revision','7');`,
    );
    const payload = row("legacy", "Incasso CITTÀ DI LECCE");
    old
      .query(
        "INSERT INTO records(collection,id,entity_id,account_id,date,payload) VALUES(?,?,?,?,?,?)",
      )
      .run(
        "transactions",
        payload.id,
        "operator",
        "bank",
        "2026-02-01",
        JSON.stringify(payload),
      );
    old.close();
    const migrated = makeStore(path);
    expect(ids(search(migrated, "città"))).toEqual(["legacy"]);
    expect(migrated.revision()).toBe(7);
    expect(migrated.audit()).toHaveLength(0);
    expect(migrated.get("transactions", "legacy")).toEqual(payload);
    expect(
      (
        migrated.db
          .query("SELECT version FROM schema_migrations ORDER BY version")
          .all() as { version: number }[]
      ).map((x) => x.version),
    ).toEqual([1, 4]);
    migrated.put("transactions", row("added", "Bonifico Palermo"));
    migrated.close();
    stores.delete(migrated);
    const reopened = makeStore(path);
    expect(ids(search(reopened, "città"))).toEqual(["legacy"]);
    expect(ids(search(reopened, "palermo"))).toEqual(["added"]);
    expect(reopened.revision()).toBe(8);
  });
});

describe("search projection ownership", () => {
  test("projection write failure rolls back standalone Store.put without requiring a caller transaction", () => {
    const store = makeStore();
    const revision = store.revision();
    store.db.exec(
      "CREATE TRIGGER reject_test_lookup BEFORE INSERT ON record_lookup WHEN new.id='reject' BEGIN SELECT RAISE(ABORT,'fixture rejects lookup');END;",
    );
    expect(() =>
      store.put("transactions", row("reject", "Should not persist")),
    ).toThrow("fixture rejects lookup");
    expect(store.get("transactions", "reject")).toBeUndefined();
    expect(store.revision()).toBe(revision);
    expect(store.audit()).toHaveLength(0);
    expect(search(store, "persist").total).toBe(0);
  });
  test("embedded null characters cannot truncate substring queries", () => {
    const store = makeStore();
    store.put("transactions", row("exact", "Quota a\u0000bc confermata"));
    store.put("transactions", row("decoy", "Quota abc confermata"));
    expect(ids(search(store, "a\u0000bc"))).toEqual(["exact"]);
    expect(ids(search(store, "abc"))).toEqual(["decoy"]);
  });
  test("local trigram prototype upgrades without losing canonical data or leaving obsolete search columns", () => {
    const dir = mkdtempSync(join(tmpdir(), "opentesoro-search-upgrade-"));
    directories.push(dir);
    const path = join(dir, "prototype.sqlite");
    const old = new Database(path, { create: true });
    old.exec(
      `CREATE TABLE schema_migrations(version INTEGER PRIMARY KEY,applied_at TEXT NOT NULL);INSERT INTO schema_migrations VALUES(1,'legacy'),(2,'prototype');CREATE TABLE records(collection TEXT NOT NULL,id TEXT NOT NULL,entity_id TEXT,account_id TEXT,date TEXT,external_key TEXT,payload TEXT NOT NULL CHECK(json_valid(payload)),revision INTEGER NOT NULL DEFAULT 1,search_description TEXT NOT NULL DEFAULT '',search_counterparty TEXT NOT NULL DEFAULT '',search_name TEXT NOT NULL DEFAULT '',PRIMARY KEY(collection,id));CREATE VIRTUAL TABLE record_search USING fts5(search_description,search_counterparty,search_name,content='records',tokenize='trigram');CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);INSERT INTO metadata VALUES('revision','13');`,
    );
    const payload = row("preserved", "Incasso CITTÀ DI LECCE");
    old
      .query("INSERT INTO records(collection,id,payload) VALUES(?,?,?)")
      .run("transactions", "preserved", JSON.stringify(payload));
    old.exec("INSERT INTO record_search(record_search) VALUES('rebuild')");
    old.close();
    const migrated = makeStore(path);
    expect(migrated.get("transactions", "preserved")).toEqual(payload);
    expect(ids(search(migrated, "città"))).toEqual(["preserved"]);
    expect(migrated.revision()).toBe(13);
    const columns = (
      migrated.db.query("PRAGMA table_info(records)").all() as {
        name: string;
      }[]
    ).map((x) => x.name);
    expect(columns).not.toContain("search_description");
    expect(
      migrated.db
        .query("SELECT name FROM sqlite_master WHERE name='record_search'")
        .get(),
    ).toBeNull();
    expect(
      migrated.db
        .query("SELECT max(version) AS version FROM schema_migrations")
        .get(),
    ).toEqual({ version: 4 });
  });
});
