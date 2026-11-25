import { createHash } from "node:crypto";

export function requestHash(parts: Array<string | number | null | undefined>): string {
  return createHash("sha256")
    .update(parts.map((part) => (part == null ? "" : String(part))).join("|"))
    .digest("hex");
}

export function missingOperation(error: { code?: string; message?: string } | null | undefined): boolean {
  const text = `${error?.code ?? ""} ${error?.message ?? ""}`;
  return /shop_add_invoice_line_once|shop_collect_invoice_once|shop_return_invoice_line_once|PGRST202|schema cache/i.test(
    text,
  );
}
