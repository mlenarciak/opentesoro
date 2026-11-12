import { rmSync } from "node:fs";
export default async function teardown() {
  // Only the two fixture paths created for this run, never application data.
  for (const key of ["OPENTESORO_E2E_DEMO_DB", "OPENTESORO_E2E_EMPTY_DB"]) {
    const path = process.env[key];
    if (!path || !path.includes("opentesoro-e2e-")) continue;
    for (const suffix of ["", "-wal", "-shm"])
      rmSync(path + suffix, { force: true });
  }
}
