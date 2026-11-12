import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Store } from "../apps/server/src/store";
import { seedDemo } from "../apps/server/src/demo";
import { createApp } from "../apps/server/src/app";

if (!Bun.which("sqlite3"))
  throw new Error("This optional backup drill requires the sqlite3 CLI.");
const dir = mkdtempSync(join(tmpdir(), "opentesoro-backup-drill-"));
const source = join(dir, "live.sqlite"),
  target = join(dir, "backup.sqlite");
let live: Store | undefined, restored: Store | undefined;
try {
  live = new Store(source);
  seedDemo(live);
  const app = createApp(live);
  const before = await (
    await app(new Request("http://localhost/api/v1/forecast"))
  ).json();
  const auditCount = (s: Store) =>
    (s.db.query("SELECT count(*) AS n FROM audit").get() as { n: number }).n;
  // Source remains open in WAL mode while SQLite takes an online snapshot.
  const backup = Bun.spawnSync([
    "sqlite3",
    source,
    `.backup ${JSON.stringify(target)}`,
  ]);
  if (backup.exitCode !== 0)
    throw new Error("SQLite backup failed: " + backup.stderr.toString());
  const integrity = Bun.spawnSync([
    "sqlite3",
    target,
    "PRAGMA integrity_check;",
  ]);
  if (integrity.exitCode !== 0 || integrity.stdout.toString().trim() !== "ok")
    throw new Error("Backup integrity check failed");
  restored = new Store(target);
  const after = await (
    await createApp(restored)(new Request("http://localhost/api/v1/forecast"))
  ).json();
  if (
    JSON.stringify(before) !== JSON.stringify(after) ||
    live.revision() !== restored.revision() ||
    auditCount(live) !== auditCount(restored)
  )
    throw new Error("Restored financial state differs");
  console.log(
    JSON.stringify(
      {
        result: "passed",
        mode: "online SQLite backup with live WAL source",
        integrity: "ok",
        transactionCount: restored.list("transactions").length,
        obligationCount: restored.list("obligations").length,
        auditCount: auditCount(restored),
        revision: restored.revision(),
        closingBalanceMinor: after.closingBalanceMinor,
        scope:
          "Synthetic temporary fixture only; production RPO/RTO not measured",
      },
      null,
      2,
    ),
  );
} finally {
  restored?.close();
  live?.close();
  rmSync(dir, { recursive: true, force: true });
}
