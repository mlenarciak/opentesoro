import { createHash } from "node:crypto";
import { date } from "./validation";
export interface ImportRow {
  row: number;
  date: string;
  description: string;
  counterparty: string;
  amountMinor: number;
  externalId: string;
}
export interface ImportPreview {
  rows: ImportRow[];
  errors: { row: number; message: string }[];
  totalRows: number;
  delimiter: string;
}
export function parseDelimited(text: string, delimiter: string): string[][] {
  const result: string[][] = [];
  let row: string[] = [],
    value = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          value += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else value += c;
    } else if (c === '"' && value === "" && !closed) quoted = true;
    else if (c === delimiter) {
      row.push(value);
      value = "";
      closed = false;
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(value);
      if (row.some((x) => x.trim())) result.push(row);
      row = [];
      value = "";
      closed = false;
    } else if (closed && c.trim() !== "")
      throw new Error("Unexpected characters after closing CSV quote");
    else if (!closed) value += c;
  }
  if (quoted) throw new Error("Unclosed CSV quote");
  row.push(value);
  if (row.some((x) => x.trim())) result.push(row);
  return result;
}
export function parseAmount(input: string): number {
  let s = input
    .trim()
    .replace(/€/g, "")
    .replace(/[\s\u00a0]/g, "");
  if (/^\(.*\)$/.test(s)) s = "-" + s.slice(1, -1);
  if (s.includes(",")) {
    if (!/^[+-]?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{1,2}$/.test(s))
      throw new Error("Invalid Italian decimal amount");
    s = s.replace(/\./g, "").replace(",", ".");
  }
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/.test(s))
    throw new Error("Amount must have at most two decimals");
  const negative = s.startsWith("-");
  s = s.replace(/^[+-]/, "");
  const [whole, fraction = ""] = s.split(".");
  const n = BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, "0"));
  const signed = negative ? -n : n;
  if (
    signed > BigInt(Number.MAX_SAFE_INTEGER) ||
    signed < BigInt(Number.MIN_SAFE_INTEGER)
  )
    throw new Error("Amount exceeds safe range");
  return Number(signed);
}
const aliases: Record<string, string> = {
  data: "date",
  dataoperazione: "date",
  datacontabile: "date",
  date: "date",
  descrizione: "description",
  causale: "description",
  description: "description",
  importo: "amount",
  amount: "amount",
  controparte: "counterparty",
  beneficiario: "counterparty",
  counterparty: "counterparty",
  riferimento: "externalid",
  externalid: "externalid",
  id: "externalid",
};
export function previewCsv(input: string): ImportPreview {
  if (Buffer.byteLength(input) > 2 * 1024 * 1024)
    throw new Error("CSV exceeds 2 MiB");
  const text = input.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0] ?? "";
  const delimiter =
    (first.match(/;/g)?.length ?? 0) > (first.match(/,/g)?.length ?? 0)
      ? ";"
      : ",";
  const parsed = parseDelimited(text, delimiter);
  const rawHeaders = parsed.shift();
  if (!rawHeaders) throw new Error("CSV is empty");
  const headers = rawHeaders.map(
    (h) => aliases[h.toLowerCase().replace(/[\s_-]/g, "")] ?? h.toLowerCase(),
  );
  for (const required of ["date", "description", "amount"])
    if (headers.filter((x) => x === required).length !== 1)
      throw new Error(`CSV requires exactly one ${required} column`);
  if (parsed.length > 10000) throw new Error("CSV exceeds 10,000 rows");
  const rows: ImportRow[] = [],
    errors: ImportPreview["errors"] = [],
    occurrences = new Map<string, number>();
  parsed.forEach((cells, index) => {
    try {
      if (cells.length !== headers.length)
        throw new Error("Column count does not match header");
      const get = (name: string) => cells[headers.indexOf(name)]?.trim() ?? "";
      let day = get("date");
      const it = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(day);
      if (it) day = `${it[3]}-${it[2]}-${it[1]}`;
      date.parse(day);
      const description = get("description");
      if (!description || description.length > 1000)
        throw new Error(
          "Description is required and must be at most 1000 characters",
        );
      const amountMinor = parseAmount(get("amount"));
      const counterparty = get("counterparty");
      const identity = JSON.stringify([
        day,
        description,
        amountMinor,
        counterparty,
      ]);
      const nth = (occurrences.get(identity) ?? 0) + 1;
      occurrences.set(identity, nth);
      const externalId =
        get("externalid") ||
        "csv:" +
          createHash("sha256")
            .update(identity + ":" + nth)
            .digest("hex");
      rows.push({
        row: index + 2,
        date: day,
        description,
        counterparty,
        amountMinor,
        externalId,
      });
    } catch (e) {
      errors.push({
        row: index + 2,
        message: e instanceof Error ? e.message : "Invalid row",
      });
    }
  });
  return { rows, errors, totalRows: parsed.length, delimiter };
}
export function exportCsv(
  rows: Record<string, unknown>[],
  columns: string[],
): string {
  const escape = (value: unknown) => {
    let s = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(s) && typeof value !== "number") s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  };
  return (
    "\uFEFF" +
    [
      columns.map(escape).join(";"),
      ...rows.map((row) => columns.map((c) => escape(row[c])).join(";")),
    ].join("\r\n")
  );
}
