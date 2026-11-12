import { defineConfig } from "@playwright/test";
import { join } from "node:path";
import { tmpdir } from "node:os";
const suffix = String(process.pid);
// Reuse the public demo acceptance suite against the production container or HTTPS deployment.
const deployedDemo = process.env.OPENTESORO_E2E_PUBLIC_URL;
process.env.OPENTESORO_E2E_DEMO_DB ??= join(
  tmpdir(),
  `opentesoro-e2e-demo-${suffix}.sqlite`,
);
process.env.OPENTESORO_E2E_EMPTY_DB ??= join(
  tmpdir(),
  `opentesoro-e2e-empty-${suffix}.sqlite`,
);
export default defineConfig({
  testDir: "./e2e",
  testMatch: deployedDemo ? "**/public-demo.e2e.ts" : "**/*.e2e.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  retries: 0,
  globalTeardown: deployedDemo ? undefined : "./e2e/teardown.ts",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4399",
    viewport: { width: 1440, height: 1000 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    },
  },
  webServer: deployedDemo
    ? []
    : [
        {
          command: "bun apps/server/src/index.ts",
          url: "http://127.0.0.1:4399/health",
          reuseExistingServer: false,
          env: {
            PORT: "4399",
            DATABASE_PATH: process.env.OPENTESORO_E2E_DEMO_DB!,
            OPENTESORO_DEMO: "true",
            OPENTESORO_API_TOKEN: "",
            OPENTESORO_READ_ONLY_TOKEN: "",
          },
        },
        {
          command: "bun apps/server/src/public-demo-index.ts",
          url: "http://127.0.0.1:4401/health",
          reuseExistingServer: false,
          env: {
            HOST: "127.0.0.1",
            PORT: "4401",
            PUBLIC_DEMO_ORIGIN: "http://127.0.0.1:4401",
            DATABASE_PATH: ":memory:",
            OPENTESORO_DEMO: "true",
            OPENTESORO_API_TOKEN: "",
            OPENTESORO_READ_ONLY_TOKEN: "",
            AGICAP_CLIENT_ID: "",
            AGICAP_CLIENT_SECRET: "",
          },
        },
        {
          command: "bun apps/server/src/index.ts",
          url: "http://127.0.0.1:4400/health",
          reuseExistingServer: false,
          env: {
            PORT: "4400",
            DATABASE_PATH: process.env.OPENTESORO_E2E_EMPTY_DB!,
            OPENTESORO_DEMO: "false",
            OPENTESORO_API_TOKEN: "",
            OPENTESORO_READ_ONLY_TOKEN: "",
          },
        },
      ],
});
