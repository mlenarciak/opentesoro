import { z } from "zod";
import { schemas } from "./validation";
import {
  forecastContract,
  dashboardContract,
  bootstrapContract,
  previewContract,
  candidatesContract,
} from "./contracts";
const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const content = (schema: unknown) => ({ "application/json": { schema } });
const response = (schema: unknown) => ({
  description: "Success",
  content: content(schema),
});
const problem = { $ref: "#/components/responses/Problem" };
const paths: Record<string, unknown> = {};
for (const [kind, schema] of Object.entries(schemas)) {
  const name = kind[0]!.toUpperCase() + kind.slice(1);
  const parameters = [
    { name: "accountId", in: "query", schema: { type: "string" } },
    {
      name: "categoryId",
      in: "query",
      description: "Category ID or uncategorized",
      schema: { type: "string" },
    },
    { name: "status", in: "query", schema: { type: "string" } },
    { name: "direction", in: "query", schema: { enum: ["inflow", "outflow"] } },
    { name: "entityId", in: "query", schema: { type: "string" } },
    {
      name: "limit",
      in: "query",
      schema: { type: "integer", minimum: 1, maximum: 1000, default: 100 },
    },
    {
      name: "offset",
      in: "query",
      schema: { type: "integer", minimum: 0, default: 0 },
    },
    { name: "search", in: "query", schema: { type: "string" } },
  ];
  const base: any = {
    get: {
      operationId: `list${name}`,
      tags: [kind],
      parameters,
      responses: {
        200: response({
          type: "object",
          required: ["items", "total", "limit", "offset"],
          properties: {
            items: { type: "array", items: ref(name) },
            total: { type: "integer" },
            limit: { type: "integer" },
            offset: { type: "integer" },
          },
        }),
        401: problem,
        422: problem,
      },
    },
  };
  const detail: any = {
    parameters: [
      { name: "id", in: "path", required: true, schema: { type: "string" } },
    ],
    get: {
      operationId: `get${name}`,
      tags: [kind],
      responses: { 200: response(ref(name)), 404: problem },
    },
  };
  if (kind !== "settlements") {
    const create = z.toJSONSchema(schema, { io: "input" }) as any;
    delete create.$schema;
    create.required = (create.required ?? []).filter((x: string) => x !== "id");
    base.post = {
      operationId: `create${name}`,
      tags: [kind],
      parameters: [
        {
          name: "Idempotency-Key",
          in: "header",
          schema: { type: "string", maxLength: 200 },
        },
      ],
      requestBody: { required: true, content: content(create) },
      responses: { 201: response(ref(name)), 409: problem, 422: problem },
    };
    const patch = {
      ...create,
      required: [],
      properties: { ...create.properties },
    };
    if (patch.properties.categoryId)
      patch.properties.categoryId = {
        anyOf: [patch.properties.categoryId, { type: "null" }],
        description: "Set null to clear category assignment.",
      };
    detail.patch = {
      operationId: `update${name}`,
      tags: [kind],
      requestBody: { required: true, content: content(patch) },
      responses: {
        200: response(ref(name)),
        404: problem,
        409: problem,
        422: problem,
      },
    };
    if (kind !== "bookings")
      detail.delete = {
        operationId: `delete${name}`,
        tags: [kind],
        responses: { 204: { description: "Deleted" }, 409: problem },
      };
  }
  paths[`/api/v1/${kind}`] = base;
  paths[`/api/v1/${kind}/{id}`] = detail;
}
const object = { type: "object", additionalProperties: true };
const contract = (schema: z.ZodType) => {
  const result = z.toJSONSchema(schema) as any;
  delete result.$schema;
  return result;
};
const workflowOutputs: Record<string, unknown> = {
  "/bootstrap": contract(bootstrapContract),
  "/dashboard": contract(dashboardContract),
  "/forecast": contract(forecastContract),
  "/reconciliation/suggestions": contract(candidatesContract),
};
for (const [path, operationId, description] of [
  [
    "/bootstrap",
    "getBootstrap",
    "Entities, accounts, categories, obligations, scenarios, bookings, rules, settlements, and at most 5,000 transactions. transactionsTotal signals truncation.",
  ],
  [
    "/dashboard",
    "getDashboard",
    "Cash balances as of installation date, aging reports, and uncategorized counts.",
  ],
  [
    "/forecast",
    "getForecast",
    "Deterministic cash-flow forecast. Account snapshots are CLOSED balances; from must follow every selected snapshot.",
  ],
  ["/audit", "getAudit", "Latest 100 append-only audit events."],
  [
    "/reconciliation/suggestions",
    "suggestReconciliation",
    "Candidate scores, reasons, and available settlement amount. Suggestions never apply automatically.",
  ],
])
  paths[`/api/v1${path}`] = {
    get: {
      operationId,
      description,
      tags: ["workflows"],
      parameters:
        path === "/forecast"
          ? [
              {
                name: "from",
                in: "query",
                schema: { type: "string", format: "date" },
              },
              {
                name: "to",
                in: "query",
                schema: { type: "string", format: "date" },
              },
              {
                name: "granularity",
                in: "query",
                schema: { enum: ["day", "week", "month"], default: "month" },
              },
              { name: "scenarioId", in: "query", schema: { type: "string" } },
              { name: "entityId", in: "query", schema: { type: "string" } },
            ]
          : path === "/reconciliation/suggestions"
            ? [
                {
                  name: "transactionId",
                  in: "query",
                  required: true,
                  schema: { type: "string" },
                },
              ]
            : [],
      responses: {
        200: response(workflowOutputs[path!] ?? object),
        401: problem,
        422: problem,
      },
    },
  };
for (const [path, operationId, body] of [
  [
    "/import/preview",
    "previewImport",
    {
      type: "object",
      required: ["csv"],
      properties: { csv: { type: "string", maxLength: 2097152 } },
    },
  ],
  [
    "/import/commit",
    "commitImport",
    {
      type: "object",
      required: ["csv", "accountId"],
      properties: {
        csv: { type: "string", maxLength: 2097152 },
        accountId: { type: "string" },
      },
    },
  ],
  [
    "/reconciliation",
    "reconcilePayment",
    {
      type: "object",
      required: ["transactionId", "obligationId", "amountMinor"],
      properties: {
        transactionId: { type: "string" },
        obligationId: { type: "string" },
        amountMinor: { type: "integer", minimum: 1 },
      },
    },
  ],
  [
    "/rules/apply",
    "applyRules",
    { type: "object", additionalProperties: false },
  ],
] as const)
  paths[`/api/v1${path}`] = {
    post: {
      operationId,
      tags: ["workflows"],
      requestBody: { required: true, content: content(body) },
      responses: {
        200: response(
          path === "/import/preview" ? contract(previewContract) : object,
        ),
        201: response(
          path === "/reconciliation"
            ? {
                type: "object",
                required: ["obligation", "settlement"],
                properties: {
                  obligation: ref("Obligations"),
                  settlement: ref("Settlements"),
                },
              }
            : path === "/import/commit"
              ? {
                  type: "object",
                  required: ["imported", "duplicates", "totalRows"],
                  properties: {
                    imported: { type: "integer" },
                    duplicates: { type: "integer" },
                    totalRows: { type: "integer" },
                  },
                }
              : object,
        ),
        401: problem,
        409: problem,
        422: problem,
      },
    },
  };
paths["/api/v1/export"] = {
  get: {
    operationId: "exportData",
    parameters: [
      {
        name: "format",
        in: "query",
        schema: { enum: ["json", "csv"], default: "json" },
      },
    ],
    responses: {
      200: {
        description:
          "JSON export or semicolon CSV; CSV amounts are integer cents.",
        content: {
          "application/json": { schema: object },
          "text/csv": { schema: { type: "string" } },
        },
      },
    },
  },
};
paths["/health"] = {
  get: {
    operationId: "health",
    security: [],
    responses: { 200: response(object) },
  },
};
for (const item of Object.values(paths)) {
  for (const method of ["get", "post", "patch", "delete"]) {
    const operation = (
      item as Record<string, { operationId?: string; summary?: string }>
    )[method];
    if (operation?.operationId)
      operation.summary = operation.operationId
        .replace(/([A-Z])/g, " $1")
        .replace(/^./, (x) => x.toUpperCase());
  }
}
export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "OpenTesoro API",
    version: "0.1.0",
    description:
      "Local-first treasury API. Signed integer minor units, ISO calendar dates, EUR-first. HTTP bearer auth when configured. API is single-organization; entities are reporting perimeters, not tenant authorization boundaries.",
  },
  servers: [{ url: "/" }],
  security: [{ bearerAuth: [] }],
  paths,
  components: {
    securitySchemes: { bearerAuth: { type: "http", scheme: "bearer" } },
    schemas: Object.fromEntries(
      Object.entries(schemas).map(([kind, schema]) => {
        const result = z.toJSONSchema(schema) as any;
        delete result.$schema;
        return [kind[0]!.toUpperCase() + kind.slice(1), result];
      }),
    ),
    responses: {
      Problem: {
        description: "RFC 9457 style problem",
        content: {
          "application/problem+json": {
            schema: {
              type: "object",
              required: ["type", "title", "status", "detail", "requestId"],
              properties: {
                type: { type: "string" },
                title: { type: "string" },
                status: { type: "integer" },
                detail: { type: "string" },
                requestId: { type: "string" },
              },
            },
          },
        },
      },
    },
  },
};
