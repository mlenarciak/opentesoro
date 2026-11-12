import { describe, expect, test } from "bun:test";
import {
  AgicapReadClient,
  AgicapError,
  type FetchTransport,
  type AgicapClientOptions,
} from "./index.ts";

const ORG = "12345678-1234-1234-1234-123456789abc";
const EXPORT = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const TOKEN = {
  access_token: "test-access-token",
  token_type: "Bearer",
  expires_in: 3600,
  scope: "agicap:public-api",
};
const PAGE = {
  items: [{ id: ORG, name: "Synthetic organization" }],
  pagination: {
    currentPageNumber: 1,
    currentPageItemsCount: 1,
    pageSize: 100,
    totalItemsCount: 1,
    pagesCount: 1,
  },
};
const BANK_PAGE = {
  Items: [
    {
      AccountNumber: "DEMO-ACCOUNT",
      ConnectionId: EXPORT,
      CreatedAt: "2026-11-12T00:00:00Z",
      EntityId: 12,
    },
  ],
  Pagination: {
    CurrentPageNumber: 1,
    CurrentPageItemsCount: 1,
    PageSize: 100,
    TotalItemsCount: 1,
    PagesCount: 1,
  },
};
const SUMMARY = {
  exportId: EXPORT,
  exportDateUtc: "2026-11-12T01:02:03.000Z",
  exportIndexInYear: 1,
  exportYear: 2026,
  numberOfEntries: 1,
  indexInYearOfFirstEntryInBankJournal: 1,
  indexInYearOfLastEntryInBankJournal: 1,
};
const JOURNAL_PAGE = {
  items: [SUMMARY],
  cursor: { after: "2026-11-12T01:02:03.000Z", before: null, size: 1 },
};
const json = (value: unknown, status = 200) => Response.json(value, { status });
interface Call {
  url: URL;
  init: RequestInit;
}
function fixture(
  responses: (() => Response | Promise<Response>)[],
  options: Partial<AgicapClientOptions> = {},
) {
  const calls: Call[] = [];
  const transport: FetchTransport = async (input, init) => {
    calls.push({ url: new URL(String(input)), init: init! });
    const next = responses.shift();
    if (!next) throw new Error("Unexpected request");
    return next();
  };
  const client = new AgicapReadClient({
    clientId: "synthetic-client",
    clientSecret: "synthetic-secret",
    fetch: transport,
    maxRetries: 0,
    ...options,
  });
  return { client, calls };
}

describe("read-only public adapter", () => {
  test("authenticates through official OAuth endpoint and caches a token", async () => {
    const { client, calls } = fixture([
      () => json(TOKEN),
      () => json(PAGE),
      () => json(PAGE),
    ]);
    expect((await client.listOrganizations()).items[0]?.name).toBe(
      "Synthetic organization",
    );
    await client.listOrganizations({ pageNumber: 2, pageSize: 10 });
    expect(calls).toHaveLength(3);
    expect(calls[0]?.url.href).toBe(
      "https://api.agicap.com/public/auth/v1/token",
    );
    expect(calls[0]?.init.method).toBe("POST");
    const form = calls[0]?.init.body as URLSearchParams;
    expect(form.get("grant_type")).toBe("client_credentials");
    expect(form.get("scope")).toBe("agicap:public-api");
    expect(calls[2]?.url.searchParams.get("pageNumber")).toBe("2");
    expect(calls[2]?.url.searchParams.get("pageSize")).toBe("10");
    for (const call of calls) {
      expect(call.url.origin).toBe("https://api.agicap.com");
      expect(call.init.redirect).toBe("error");
      expect(call.init.credentials).toBe("omit");
      expect(call.init.headers).toMatchObject({
        "User-Agent": "OpenTesoro-Agicap/0.1",
      });
      if (call.url.pathname !== "/public/auth/v1/token") {
        expect(call.init.method).toBe("GET");
        expect(call.init.headers).toMatchObject({
          Authorization: "Bearer test-access-token",
        });
      }
    }
    expect(JSON.stringify(client)).not.toContain("synthetic-secret");
    client.dispose();
  });

  test("shares an in-flight exchange between concurrent readers", async () => {
    let finish: ((value: Response) => void) | undefined;
    const { client, calls } = fixture([
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      () => json(PAGE),
      () => json(PAGE),
    ]);
    const first = client.listOrganizations(),
      second = client.listOrganizations();
    await Promise.resolve();
    expect(calls).toHaveLength(1);
    finish!(json(TOKEN));
    await Promise.all([first, second]);
    expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(1);
    client.dispose();
  });

  test("refreshes before expiry using injected clock", async () => {
    let clock = 0;
    const { client, calls } = fixture(
      [
        () => json(TOKEN),
        () => json(PAGE),
        () => json(TOKEN),
        () => json(PAGE),
      ],
      { now: () => clock },
    );
    await client.listOrganizations();
    clock = 3_570_001;
    await client.listOrganizations();
    expect(calls.filter((call) => call.init.method === "POST")).toHaveLength(2);
    client.dispose();
  });

  test("retains entity country and validates selected organization ID before I/O", async () => {
    const { client, calls } = fixture([
      () => json(TOKEN),
      () =>
        json({ ...PAGE, items: [{ id: 12, name: "Demo SRL", country: "IT" }] }),
    ]);
    expect((await client.listEntities(ORG)).items).toEqual([
      { id: 12, name: "Demo SRL", country: "IT" },
    ]);
    expect(calls[1]?.url.pathname).toBe(
      `/public/organizations/v1/${ORG}/entities`,
    );
    await expect(client.listEntities("../private")).rejects.toBeInstanceOf(
      TypeError,
    );
    expect(calls).toHaveLength(2);
    client.dispose();
  });

  test("preserves banking product PascalCase", async () => {
    const { client, calls } = fixture([
      () => json(TOKEN),
      () => json(BANK_PAGE),
    ]);
    expect(await client.listBankAccounts(ORG)).toEqual(BANK_PAGE);
    expect(calls[1]?.url.searchParams.get("PageNumber")).toBe("1");
    expect(calls[1]?.url.pathname).toBe(
      `/public/banking-documents/v1/organizations/${ORG}/bank-accounts`,
    );
    client.dispose();
  });

  test("accepts nullable banking item list", async () => {
    const { client } = fixture([
      () => json(TOKEN),
      () => json({ ...BANK_PAGE, Items: null }),
    ]);
    expect((await client.listBankAccounts(ORG)).Items).toBeNull();
    client.dispose();
  });

  test("reads existing bank connections without creating any", async () => {
    const response = {
      ...BANK_PAGE,
      Items: [{ Id: EXPORT, Name: "Demo bank", Type: "SWIFT" }],
    };
    const { client, calls } = fixture([
      () => json(TOKEN),
      () => json(response),
    ]);
    expect((await client.listBankConnections(12)).Items).toEqual(
      response.Items,
    );
    expect(calls[1]?.url.pathname).toBe(
      "/public/banking-documents/v1/entities/12/connections",
    );
    client.dispose();
  });

  test("uses explicit cursor and GET for existing journal exports", async () => {
    const { client, calls } = fixture([
      () => json(TOKEN),
      () => json(JOURNAL_PAGE),
    ]);
    expect(
      await client.listJournalExports(12, { after: "2026-11-01T00:00:00Z" }),
    ).toEqual(JOURNAL_PAGE);
    expect(calls[1]?.url.pathname).toBe(
      "/public/treasury-bank-journal/v1/entities/12/exports",
    );
    expect(calls[1]?.init.method).toBe("GET");
    expect(calls[1]?.url.searchParams.get("after")).toBe(
      "2026-11-01T00:00:00Z",
    );
    client.dispose();
  });

  test("reads a previous journal export and leaves decimal amounts unconverted", async () => {
    const value = {
      exportId: EXPORT,
      entityName: "Demo SRL",
      year: 2026,
      bankJournalExportIndexInYear: 1,
      entries: [
        {
          agicapUniqueId: ORG,
          name: "Demo entry",
          paymentDate: "2026-11-12",
          originalCurrency: "EUR",
          accountingCurrency: "EUR",
          debitInOriginalCurrency: 12.3456,
        },
      ],
    };
    const { client, calls } = fixture([() => json(TOKEN), () => json(value)]);
    expect(await client.getJournalExport(12, EXPORT)).toEqual(value);
    expect(calls[1]?.url.pathname).toEndWith(`/exports/${EXPORT}`);
    client.dispose();
  });

  test("refuses journal export identity mismatch", async () => {
    const { client } = fixture([
      () => json(TOKEN),
      () =>
        json({
          exportId: ORG,
          entityName: "Demo",
          year: 2026,
          bankJournalExportIndexInYear: 1,
          entries: [],
        }),
    ]);
    await expect(client.getJournalExport(12, EXPORT)).rejects.toMatchObject({
      code: "malformed_response",
    });
    client.dispose();
  });

  test("rejects invalid dates, pagination, entity and ambiguous cursor before network", async () => {
    const { client, calls } = fixture([]);
    await expect(
      client.listOrganizations({ pageSize: 1001 }),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(client.listBankConnections(-1)).rejects.toBeInstanceOf(
      TypeError,
    );
    await expect(
      client.listJournalExports(12, { after: "2026-02-30T00:00:00Z" }),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      client.listJournalExports(12, { after: "2026-11-12T00:00:00" }),
    ).rejects.toBeInstanceOf(TypeError);
    await expect(
      client.listJournalExports(12, {
        after: "2026-11-12T00:00:00Z",
        before: "2026-11-13T00:00:00Z",
      } as never),
    ).rejects.toBeInstanceOf(TypeError);
    expect(calls).toHaveLength(0);
    client.dispose();
  });
});

describe("failures, retry and lifecycle", () => {
  test("403 is returned without token-refresh loops", async () => {
    const { client, calls } = fixture([
      () => json(TOKEN),
      () => json({ detail: "sensitive body" }, 403),
    ]);
    await expect(client.listOrganizations()).rejects.toMatchObject({
      code: "http",
      status: 403,
    });
    expect(calls).toHaveLength(2);
    client.dispose();
  });

  test("401 refreshes once then fails if still unauthorized", async () => {
    const { client, calls } = fixture([
      () => json(TOKEN),
      () => json({}, 401),
      () => json({ ...TOKEN, access_token: "new-token" }),
      () => json({}, 401),
    ]);
    await expect(client.listOrganizations()).rejects.toMatchObject({
      status: 401,
    });
    expect(calls).toHaveLength(4);
    client.dispose();
  });

  test("token endpoint failure is not automatically retried", async () => {
    const { client, calls } = fixture([() => json({}, 429)], { maxRetries: 3 });
    await expect(client.listOrganizations()).rejects.toMatchObject({
      operation: "authentication",
      status: 429,
    });
    expect(calls).toHaveLength(1);
    client.dispose();
  });

  test("429 GET uses minute-window backoff; 503 retry is shorter", async () => {
    const delays: number[] = [];
    const { client, calls } = fixture(
      [
        () => json(TOKEN),
        () => json({}, 429),
        () => json({}, 503),
        () => json(PAGE),
      ],
      {
        maxRetries: 2,
        sleep: async (ms) => {
          delays.push(ms);
        },
      },
    );
    await client.listOrganizations();
    expect(delays[0]).toBeGreaterThanOrEqual(60_000);
    expect(delays[0]).toBeLessThan(61_000);
    expect(delays[1]).toBe(500);
    expect(calls).toHaveLength(4);
    expect(calls.slice(1).every((call) => call.init.method === "GET")).toBe(
      true,
    );
    client.dispose();
  });

  test("retry count is bounded", async () => {
    let delays = 0;
    const { client, calls } = fixture(
      [() => json(TOKEN), () => json({}, 503), () => json({}, 503)],
      {
        maxRetries: 1,
        sleep: async () => {
          delays++;
        },
      },
    );
    await expect(client.listOrganizations()).rejects.toMatchObject({
      status: 503,
    });
    expect(delays).toBe(1);
    expect(calls).toHaveLength(3);
    client.dispose();
  });

  test("an aborted caller does not cancel another caller's shared token exchange", async () => {
    let finish: ((value: Response) => void) | undefined;
    const { client, calls } = fixture([
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      () => json(PAGE),
    ]);
    const controller = new AbortController();
    const first = client.listOrganizations({ signal: controller.signal });
    const second = client.listOrganizations();
    controller.abort();
    await expect(first).rejects.toMatchObject({ code: "aborted" });
    finish!(json(TOKEN));
    expect((await second).items).toHaveLength(1);
    expect(calls).toHaveLength(2);
    client.dispose();
  });

  test("already aborted calls do not authenticate", async () => {
    const { client, calls } = fixture([]);
    await expect(
      client.listOrganizations({ signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(calls).toHaveLength(0);
    client.dispose();
  });

  test("caller abort during quota wait stops retries", async () => {
    const controller = new AbortController();
    const { client, calls } = fixture(
      [() => json(TOKEN), () => json({}, 429)],
      {
        maxRetries: 2,
        sleep: async () => {
          controller.abort();
        },
      },
    );
    await expect(
      client.listOrganizations({ signal: controller.signal }),
    ).rejects.toMatchObject({ code: "aborted" });
    expect(calls).toHaveLength(2);
    client.dispose();
  });

  test("timeout bounds a transport that never resolves", async () => {
    const { client } = fixture([() => new Promise(() => undefined)], {
      timeoutMs: 10,
    });
    await expect(client.listOrganizations()).rejects.toMatchObject({
      code: "timeout",
    });
    client.dispose();
  });

  test("timeout includes response body reads", async () => {
    const { client } = fixture(
      [
        () => json(TOKEN),
        () => new Response(new ReadableStream({ start() {} })),
      ],
      { timeoutMs: 10 },
    );
    await expect(client.listOrganizations()).rejects.toMatchObject({
      code: "timeout",
    });
    client.dispose();
  });

  test("dispose interrupts readers and prevents reuse", async () => {
    const { client } = fixture([() => new Promise(() => undefined)]);
    const pending = client.listOrganizations();
    client.dispose();
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    await expect(client.listOrganizations()).rejects.toMatchObject({
      code: "disposed",
    });
  });

  test("does not leak response bodies or raw transport errors", async () => {
    const secret = "do-not-expose-sensitive-token";
    const { client } = fixture([
      () => json(TOKEN),
      () => {
        throw new Error(secret);
      },
    ]);
    try {
      await client.listOrganizations();
      throw new Error("missing rejection");
    } catch (error) {
      expect(error).toBeInstanceOf(AgicapError);
      expect(String(error)).not.toContain(secret);
    }
    client.dispose();
  });

  test.each([
    ["malformed JSON", () => new Response("{broken")],
    [
      "wrong page shape",
      () => json({ items: {}, pagination: PAGE.pagination }),
    ],
    [
      "invalid entity-like organization ID",
      () => json({ ...PAGE, items: [{ id: "not-a-uuid", name: "Demo" }] }),
    ],
    [
      "invalid count",
      () =>
        json({
          ...PAGE,
          pagination: { ...PAGE.pagination, totalItemsCount: -1 },
        }),
    ],
  ])("rejects %s", async (_name, response) => {
    const { client } = fixture([() => json(TOKEN), response]);
    await expect(client.listOrganizations()).rejects.toMatchObject({
      code: "malformed_response",
    });
    client.dispose();
  });

  test("rejects malformed token metadata", async () => {
    const { client } = fixture([() => json({ ...TOKEN, expires_in: 0 })]);
    await expect(client.listOrganizations()).rejects.toMatchObject({
      code: "malformed_response",
      operation: "authentication",
    });
    client.dispose();
  });

  test("enforces response size without trusting Content-Length", async () => {
    const { client } = fixture(
      [
        () => json(TOKEN),
        () => new Response(JSON.stringify(PAGE) + " ".repeat(2000)),
      ],
      { maxResponseBytes: 1000 },
    );
    await expect(client.listOrganizations()).rejects.toMatchObject({
      code: "malformed_response",
    });
    client.dispose();
  });

  test("access probing distinguishes denied access from temporary failure", async () => {
    const { client, calls } = fixture([
      () => json(TOKEN),
      () => json(PAGE),
      () => json({}, 403),
      () => json({}, 503),
      () => json(JOURNAL_PAGE),
    ]);
    expect(
      await client.getAccessibleFeatures({
        organizationId: ORG,
        entityId: 12,
        journalAfter: "2026-11-01T00:00:00Z",
      }),
    ).toEqual({
      organizations: { state: "accessible" },
      entities: { state: "not_accessible", status: 403 },
      bankAccounts: { state: "unknown", errorCode: "http", status: 503 },
      journalExports: { state: "accessible" },
    });
    expect(calls).toHaveLength(5);
    client.dispose();
  });
});
