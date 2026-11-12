import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const collections = [
  "entities",
  "accounts",
  "categories",
  "transactions",
  "obligations",
  "scenarios",
  "bookings",
  "rules",
  "settlements",
] as const;
export type Collection = (typeof collections)[number];
export type RecordData = Record<string, unknown> & { id: string };
/** Normalize once at persistence; substring queries never reinterpret canonical JSON. */
function searchText(value: unknown): string {
  return typeof value === "string"
    ? value.normalize("NFKC").toLocaleLowerCase("it-IT")
    : "";
}
const lookupSql = `INSERT INTO record_lookup(collection,id,entity_id,account_id,date,category_id,status,amount_minor,description,counterparty,name) VALUES(?,?,?,?,?,?,?,?,?,?,?)
 ON CONFLICT(collection,id) DO UPDATE SET entity_id=excluded.entity_id,account_id=excluded.account_id,date=excluded.date,category_id=excluded.category_id,status=excluded.status,amount_minor=excluded.amount_minor,description=excluded.description,counterparty=excluded.counterparty,name=excluded.name`;
function lookupValues(
  collection: Collection,
  record: RecordData,
): [
  string,
  string,
  string | null,
  string | null,
  string | null,
  string | null,
  string | null,
  number | null,
  string,
  string,
  string,
] {
  return [
    collection,
    record.id,
    String(record.entityId ?? "") || null,
    String(record.accountId ?? "") || null,
    String(record.date ?? record.dueDate ?? "") || null,
    String(record.categoryId ?? "") || null,
    String(record.status ?? "") || null,
    typeof record.amountMinor === "number" ? record.amountMinor : null,
    searchText(record.description),
    searchText(record.counterparty),
    searchText(record.name),
  ];
}
export class Store {
  readonly db: Database;
  constructor(path = ":memory:") {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new Database(path, { create: true, strict: true });
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    INSERT OR IGNORE INTO schema_migrations VALUES(1, datetime('now'));
    CREATE TABLE IF NOT EXISTS records(
      collection TEXT NOT NULL, id TEXT NOT NULL, entity_id TEXT, account_id TEXT, date TEXT,
      external_key TEXT, payload TEXT NOT NULL CHECK(json_valid(payload)), revision INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY(collection,id));
    CREATE UNIQUE INDEX IF NOT EXISTS unique_external ON records(collection,account_id,external_key) WHERE external_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS by_collection_date ON records(collection,date DESC,id ASC);
    CREATE INDEX IF NOT EXISTS by_entity_date ON records(collection,entity_id,date,id);
    CREATE INDEX IF NOT EXISTS by_account_date ON records(collection,account_id,date,id);
    CREATE TABLE IF NOT EXISTS audit(sequence INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, action TEXT NOT NULL, collection TEXT NOT NULL, record_id TEXT NOT NULL, before_json TEXT, after_json TEXT, actor TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS idempotency(key TEXT PRIMARY KEY, hash TEXT NOT NULL, result TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT OR IGNORE INTO metadata VALUES('revision','0');`);
    try {
      this.migrateSearch();
    } catch (error) {
      this.db.close();
      throw error;
    }
  }
  /** Compact disposable lookup projection; canonical payloads and audit revisions stay unchanged. */
  private migrateSearch() {
    this.db
      .transaction(() => {
        if (
          this.db.query("SELECT 1 FROM schema_migrations WHERE version=4").get()
        )
          return;
        // Remove earlier development projections without touching financial payloads.
        this.db.exec(
          "DROP TRIGGER IF EXISTS records_search_insert;DROP TRIGGER IF EXISTS records_search_delete;DROP TRIGGER IF EXISTS records_search_update;DROP TABLE IF EXISTS record_search;",
        );
        const existing = new Set(
          (
            this.db.query("PRAGMA table_info(records)").all() as {
              name: string;
            }[]
          ).map((column) => column.name),
        );
        for (const column of [
          "search_description",
          "search_counterparty",
          "search_name",
          "amount_minor",
        ])
          if (existing.has(column))
            this.db.exec(`ALTER TABLE records DROP COLUMN ${column}`);
        this.db.exec(`CREATE TABLE record_lookup(
       collection TEXT NOT NULL,id TEXT NOT NULL,entity_id TEXT,account_id TEXT,date TEXT,category_id TEXT,status TEXT,amount_minor INTEGER,
       description TEXT NOT NULL,counterparty TEXT NOT NULL,name TEXT NOT NULL,PRIMARY KEY(collection,id));
       CREATE INDEX lookup_collection_date ON record_lookup(collection,date DESC,id ASC);
       CREATE INDEX lookup_entity_date ON record_lookup(collection,entity_id,date DESC,id ASC);
       CREATE INDEX lookup_account_date ON record_lookup(collection,account_id,date DESC,id ASC);
       CREATE TRIGGER records_lookup_delete AFTER DELETE ON records BEGIN DELETE FROM record_lookup WHERE collection=old.collection AND id=old.id;END;`);
        const read = this.db.query(
          "SELECT rowid,collection,payload FROM records WHERE rowid>? ORDER BY rowid LIMIT 500",
        );
        const write = this.db.query(lookupSql);
        let lastRowid = 0;
        while (true) {
          const rows = read.all(lastRowid) as {
            rowid: number;
            collection: Collection;
            payload: string;
          }[];
          if (!rows.length) break;
          for (const row of rows) {
            write.run(
              ...lookupValues(
                row.collection,
                JSON.parse(row.payload) as RecordData,
              ),
            );
            lastRowid = row.rowid;
          }
        }
        this.db.exec(
          "INSERT INTO schema_migrations VALUES(4,datetime('now'));",
        );
      })
      .immediate();
  }
  list<T = RecordData>(
    collection: Collection,
    options: {
      entityId?: string;
      accountId?: string;
      toDate?: string;
      limit?: number;
      descending?: boolean;
    } = {},
  ): T[] {
    const where = ["collection=?"];
    const values: (string | number)[] = [collection];
    if (options.entityId) {
      where.push("entity_id=?");
      values.push(options.entityId);
    }
    if (options.accountId) {
      where.push("account_id=?");
      values.push(options.accountId);
    }
    if (options.toDate) {
      where.push("date<=?");
      values.push(options.toDate);
    }
    const limit = options.limit === undefined ? "" : " LIMIT ?";
    if (options.limit !== undefined) values.push(options.limit);
    return (
      this.db
        .query(
          `SELECT payload FROM records WHERE ${where.join(" AND ")} ORDER BY date ${options.descending ? "DESC" : "ASC"},id ${options.descending ? "DESC" : "ASC"}${limit}`,
        )
        .all(...values) as { payload: string }[]
    ).map((x) => JSON.parse(x.payload) as T);
  }
  page(
    collection: Collection,
    options: {
      entityId?: string;
      accountId?: string;
      categoryId?: string;
      status?: string;
      search?: string;
      direction?: "inflow" | "outflow";
      limit: number;
      offset: number;
    },
  ) {
    const where = ["collection=?"];
    const values: (string | number)[] = [collection];
    for (const [field, column] of [
      ["entityId", "entity_id"],
      ["accountId", "account_id"],
    ] as const) {
      if (options[field]) {
        where.push(`${column}=?`);
        values.push(options[field]!);
      }
    }
    for (const [field, column] of [
      ["categoryId", "category_id"],
      ["status", "status"],
    ] as const) {
      if (options[field]) {
        if (field === "categoryId" && options[field] === "uncategorized")
          where.push("category_id IS NULL");
        else {
          where.push(`${column}=?`);
          values.push(options[field]!);
        }
      }
    }
    if (options.direction)
      where.push(
        `amount_minor ${options.direction === "inflow" ? ">" : "<"} 0`,
      );
    if (options.search) {
      const search = searchText(options.search);
      where.push(
        "(instr(description,?)>0 OR instr(counterparty,?)>0 OR instr(name,?)>0)",
      );
      values.push(search, search, search);
    }
    const clause = where.join(" AND ");
    // A substring count reads the compact projection sequentially, avoiding random wide-row reads.
    const total = (
      this.db
        .query(
          `SELECT count(*) AS n FROM record_lookup ${options.search ? "NOT INDEXED" : ""} WHERE ${clause}`,
        )
        .get(...values) as { n: number }
    ).n;
    const order = collection === "transactions" ? "DESC" : "ASC";
    const selected = this.db
      .query(
        `SELECT records.payload FROM (
      SELECT collection,id,date FROM record_lookup WHERE ${clause} ORDER BY date ${order},id LIMIT ? OFFSET ?
    ) AS page JOIN records ON records.collection=page.collection AND records.id=page.id ORDER BY page.date ${order},page.id`,
      )
      .all(...values, options.limit, options.offset) as { payload: string }[];
    const items = selected.map((row) => JSON.parse(row.payload) as RecordData);
    return { items, total, limit: options.limit, offset: options.offset };
  }
  get<T = RecordData>(collection: Collection, id: string): T | undefined {
    const row = this.db
      .query("SELECT payload FROM records WHERE collection=? AND id=?")
      .get(collection, id) as { payload: string } | null;
    return row ? (JSON.parse(row.payload) as T) : undefined;
  }
  put(collection: Collection, record: RecordData, actor = "local"): RecordData {
    const write = () => {
      const before = this.get(collection, record.id);
      this.db
        .query(
          `INSERT INTO records(collection,id,entity_id,account_id,date,external_key,payload) VALUES(?,?,?,?,?,?,?)
        ON CONFLICT(collection,id) DO UPDATE SET entity_id=excluded.entity_id,account_id=excluded.account_id,date=excluded.date,external_key=excluded.external_key,payload=excluded.payload,revision=records.revision+1`,
        )
        .run(
          collection,
          record.id,
          String(record.entityId ?? "") || null,
          String(record.accountId ?? "") || null,
          String(record.date ?? record.dueDate ?? "") || null,
          String(record.externalId ?? "") || null,
          JSON.stringify(record),
        );
      this.db.query(lookupSql).run(...lookupValues(collection, record));
      this.db
        .query(
          "INSERT INTO audit(at,action,collection,record_id,before_json,after_json,actor) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          new Date().toISOString(),
          before ? "update" : "create",
          collection,
          record.id,
          before ? JSON.stringify(before) : null,
          JSON.stringify(record),
          actor,
        );
      this.db
        .query(
          "UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='revision'",
        )
        .run();
      return record;
    };
    return this.db.inTransaction
      ? write()
      : this.db.transaction(write).immediate();
  }
  remove(collection: Collection, id: string, actor = "local") {
    const write = () => {
      const before = this.get(collection, id);
      if (!before) return false;
      this.db
        .query("DELETE FROM records WHERE collection=? AND id=?")
        .run(collection, id);
      this.db
        .query(
          "INSERT INTO audit(at,action,collection,record_id,before_json,actor) VALUES(?,?,?,?,?,?)",
        )
        .run(
          new Date().toISOString(),
          "delete",
          collection,
          id,
          JSON.stringify(before),
          actor,
        );
      this.db
        .query(
          "UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='revision'",
        )
        .run();
      return true;
    };
    return this.db.inTransaction
      ? write()
      : this.db.transaction(write).immediate();
  }
  revision(): number {
    return Number(
      (
        this.db
          .query("SELECT value FROM metadata WHERE key='revision'")
          .get() as { value: string }
      ).value,
    );
  }
  audit(limit = 100) {
    return this.db
      .query(
        "SELECT sequence,at,action,collection,record_id AS recordId,actor FROM audit ORDER BY sequence DESC LIMIT ?",
      )
      .all(limit);
  }
  atomic<T>(work: () => T): T {
    return this.db.transaction(work)();
  }
  close() {
    this.db.close();
  }
}
