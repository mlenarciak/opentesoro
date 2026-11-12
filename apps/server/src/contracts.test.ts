import { it, expect } from "bun:test";
import { Store } from "./store";
import { seedDemo } from "./demo";
import { createApp } from "./app";
import {
  bootstrapContract,
  forecastContract,
  dashboardContract,
  previewContract,
  candidatesContract,
} from "./contracts";
it("documented workflow response contracts accept real persisted results", async () => {
  const store = new Store();
  seedDemo(store);
  const app = createApp(store);
  try {
    for (const [path, schema] of [
      ["/bootstrap", bootstrapContract],
      ["/dashboard", dashboardContract],
      ["/forecast", forecastContract],
      [
        "/reconciliation/suggestions?transactionId=demo-tx-0",
        candidatesContract,
      ],
    ] as const) {
      const response = await app(new Request("http://localhost/api/v1" + path));
      expect(response.status).toBe(200);
      expect(schema.safeParse(await response.json()).success).toBe(true);
    }
    const p = await app(
      new Request("http://localhost/api/v1/import/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          csv: "date,description,amount\n2026-11-12,Test,1.23",
        }),
      }),
    );
    expect(previewContract.safeParse(await p.json()).success).toBe(true);
  } finally {
    store.close();
  }
});
