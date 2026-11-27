import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env["LC_TEST_DATABASE_URL"] ?? "";
const allowed =
  Boolean(url) &&
  !/supabase\.co|anugsuqvsnwdlsocpkil/i.test(url) &&
  /\/lc_test(\?|$)/.test(url);

describe.skipIf(!allowed)("invoice database integrity", () => {
  const sql = postgres(url, { max: 1 });

  beforeAll(async () => {
    await sql.unsafe(`
      drop schema if exists public cascade;
      create schema public;
      drop schema if exists auth cascade;
      create schema auth;
      create table auth.users (
        id uuid primary key,
        email text,
        raw_user_meta_data jsonb
      );
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
    `);
    for (const role of ["anon", "authenticated", "service_role"]) {
      await sql.unsafe(`
        do $$ begin
          if not exists (select 1 from pg_roles where rolname = '${role}') then
            create role ${role} nologin;
          end if;
        end $$;
      `);
    }
    const dir = join(process.cwd(), "drizzle/migrations");
    const files = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort();
    for (const file of files) {
      await sql.unsafe(readFileSync(join(dir, file), "utf8"));
    }
  }, 60_000);

  afterAll(async () => {
    await sql.end();
  });

  it("keeps one sale, one payment, and one return when the same operation repeats", async () => {
    const [group] = await sql<{ id: string }[]>`
      insert into product_groups (code, name, discount_percent)
      values ('T1', 'Test', 0) returning id
    `;
    const [product] = await sql<{ id: string }[]>`
      insert into products (code, name, group_id, unit, price)
      values ('TF-1', 'Test fabric', ${group!.id}, 'MT', 100) returning id
    `;
    const [customer] = await sql<{ id: string }[]>`
      insert into customers (name) values ('Test') returning id
    `;
    const [stock] = await sql<{ id: string }[]>`
      insert into inventory_items (product_id, inventory_no, quantity, status)
      values (${product!.id}, 'IN9000001', 10, 'available') returning id
    `;
    const [bill] = await sql<{ id: string }[]>`
      insert into invoices (customer_id, bill_no, status, billed_on)
      values (${customer!.id}, '9000001', 'draft', current_date) returning id
    `;
    const key = "op-fabric-0001";
    const hash = "hash-one";
    const first = await sql<{ shop_add_invoice_line_once: string }[]>`
      select shop_add_invoice_line_once(
        ${key}, ${hash}, null, ${bill!.id}, ${customer!.id}, ${stock!.id}, ${product!.id},
        'IN9000001', 10, 2, 100, 200, false
      )
    `;
    const second = await sql<{ shop_add_invoice_line_once: string }[]>`
      select shop_add_invoice_line_once(
        ${key}, ${hash}, null, ${bill!.id}, ${customer!.id}, ${stock!.id}, ${product!.id},
        'IN9000001', 8, 2, 100, 200, false
      )
    `;
    expect(second[0]?.shop_add_invoice_line_once).toBe(first[0]?.shop_add_invoice_line_once);
    const [left] = await sql<{ quantity: string }[]>`
      select quantity::text from inventory_items where id = ${stock!.id}
    `;
    expect(Number(left?.quantity)).toBe(8);
    await expect(
      sql`select shop_add_invoice_line_once(
        ${key}, 'other-hash', null, ${bill!.id}, ${customer!.id}, ${stock!.id}, ${product!.id},
        'IN9000001', 8, 1, 100, 100, false
      )`,
    ).rejects.toThrow(/different sale/);

    const genuine = await sql`
      select shop_add_invoice_line_once(
        'op-fabric-0002', 'hash-two', null, ${bill!.id}, ${customer!.id}, ${stock!.id}, ${product!.id},
        'IN9000001', 8, 1, 100, 100, false
      )
    `;
    expect(genuine).toHaveLength(1);
    const [afterSecondCut] = await sql<{ quantity: string }[]>`
      select quantity::text from inventory_items where id = ${stock!.id}
    `;
    expect(Number(afterSecondCut?.quantity)).toBe(7);

    const pay = await sql<{ shop_collect_invoice_once: string }[]>`
      select shop_collect_invoice_once(
        'op-pay-0001', 'pay-hash', null, ${bill!.id}, 50, current_date, 'CASH', null
      )
    `;
    const payAgain = await sql<{ shop_collect_invoice_once: string }[]>`
      select shop_collect_invoice_once(
        'op-pay-0001', 'pay-hash', null, ${bill!.id}, 50, current_date, 'CASH', null
      )
    `;
    expect(pay[0]?.shop_collect_invoice_once).toBe("ok");
    expect(payAgain[0]?.shop_collect_invoice_once).toBe("ok");
    const [payments] = await sql<{ count: string }[]>`
      select count(*)::text from payments where invoice_id = ${bill!.id}
    `;
    expect(payments?.count).toBe("1");

    const lineId = first[0]?.shop_add_invoice_line_once;
    if (!lineId) throw new Error("The sale did not return a line.");
    await sql`select shop_return_invoice_line_once(
      'op-return-0001', 'return-hash', null, ${bill!.id}, ${lineId}::uuid, 2, 200, 0, 0
    )`;
    await sql`select shop_return_invoice_line_once(
      'op-return-0001', 'return-hash', null, ${bill!.id}, ${lineId}::uuid, 2, 200, 0, 0
    )`;
    const [restored] = await sql<{ quantity: string }[]>`
      select quantity::text from inventory_items where id = ${stock!.id}
    `;
    expect(Number(restored?.quantity)).toBe(9);
  });

  async function seedPiece(code: string, inventoryNo: string) {
    const [group] = await sql<{ id: string }[]>`
      insert into product_groups (code, name) values (${code}, ${code}) returning id
    `;
    const [product] = await sql<{ id: string }[]>`
      insert into products (code, name, group_id, unit, price)
      values (${code}, ${code}, ${group!.id}, 'NO', 40) returning id
    `;
    const [customer] = await sql<{ id: string }[]>`
      insert into customers (name) values (${code}) returning id
    `;
    const [stock] = await sql<{ id: string }[]>`
      insert into inventory_items (product_id, inventory_no, quantity, status)
      values (${product!.id}, ${inventoryNo}, 1, 'available') returning id
    `;
    const [bill] = await sql<{ id: string }[]>`
      insert into invoices (customer_id, bill_no, status, billed_on)
      values (${customer!.id}, ${inventoryNo}, 'open', current_date) returning id
    `;
    return { product: product!.id, customer: customer!.id, stock: stock!.id, bill: bill!.id };
  }

  it("lets only one of two simultaneous sales take the last piece", async () => {
    const row = await seedPiece("PC1", "IN9000101");
    const a = postgres(url, { max: 1 });
    const b = postgres(url, { max: 1 });
    const sell = (db: postgres.Sql) =>
      db`select shop_add_invoice_line(
        ${row.bill}, ${row.customer}, ${row.stock}, ${row.product},
        'IN9000101', 1, 1, 40, 40, true
      )`;
    const results = await Promise.allSettled([sell(a), sell(b)]);
    await a.end();
    await b.end();
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    const [left] = await sql<{ quantity: string; lines: string }[]>`
      select i.quantity::text, (select count(*)::text from invoice_lines where invoice_id = ${row.bill}) as lines
      from inventory_items i where i.id = ${row.stock}
    `;
    expect(Number(left?.quantity)).toBe(0);
    expect(left?.lines).toBe("1");
  });

  it("lets only one of two simultaneous fabric cuts use the same stock reading", async () => {
    const [group] = await sql<{ id: string }[]>`
      insert into product_groups (code, name) values ('FBX', 'FBX') returning id
    `;
    const [product] = await sql<{ id: string }[]>`
      insert into products (code, name, group_id, unit, price)
      values ('FBX', 'FBX', ${group!.id}, 'MT', 10) returning id
    `;
    const [customer] = await sql<{ id: string }[]>`insert into customers (name) values ('FBX') returning id`;
    const [stock] = await sql<{ id: string }[]>`
      insert into inventory_items (product_id, inventory_no, quantity, status)
      values (${product!.id}, 'IN9000102', 5, 'available') returning id
    `;
    const [bill] = await sql<{ id: string }[]>`
      insert into invoices (customer_id, bill_no, status, billed_on)
      values (${customer!.id}, 'IN9000102', 'open', current_date) returning id
    `;
    const a = postgres(url, { max: 1 });
    const b = postgres(url, { max: 1 });
    const cut = (db: postgres.Sql) =>
      db`select shop_add_invoice_line(
        ${bill!.id}, ${customer!.id}, ${stock!.id}, ${product!.id},
        'IN9000102', 5, 3, 10, 30, false
      )`;
    const results = await Promise.allSettled([cut(a), cut(b)]);
    await a.end();
    await b.end();
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const [left] = await sql<{ quantity: string }[]>`
      select quantity::text from inventory_items where id = ${stock!.id}
    `;
    expect(Number(left?.quantity)).toBe(2);
  });

  it("restores stock once when a return is repeated at the same time", async () => {
    const row = await seedPiece("RT1", "IN9000103");
    const [line] = await sql<{ id: string }[]>`
      select shop_add_invoice_line(
        ${row.bill}, ${row.customer}, ${row.stock}, ${row.product},
        'IN9000103', 1, 1, 40, 40, true
      ) as id
    `;
    const a = postgres(url, { max: 1 });
    const b = postgres(url, { max: 1 });
    const back = (db: postgres.Sql) =>
      db`select shop_return_invoice_line_once(
        'return-race-0103', 'same-hash', null, ${row.bill}, ${line!.id}::uuid, 1, 40, 0, 0
      )`;
    const results = await Promise.allSettled([back(a), back(b)]);
    await a.end();
    await b.end();
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    const [left] = await sql<{ quantity: string }[]>`
      select quantity::text from inventory_items where id = ${row.stock}
    `;
    expect(Number(left?.quantity)).toBe(1);
  });

  it("keeps a partial balance and refuses a second collection past it", async () => {
    const row = await seedPiece("PAY1", "IN9000104");
    await sql`select shop_add_invoice_line(
      ${row.bill}, ${row.customer}, ${row.stock}, ${row.product},
      'IN9000104', 1, 1, 40, 40, true
    )`;
    const first = await sql<{ shop_collect_invoice_once: string }[]>`
      select shop_collect_invoice_once(
        'pay-0104-a', 'a', null, ${row.bill}, 15, current_date, 'UPI', null
      )
    `;
    expect(first[0]?.shop_collect_invoice_once).toBe("ok");
    const second = await sql<{ shop_collect_invoice_once: string }[]>`
      select shop_collect_invoice_once(
        'pay-0104-b', 'b', null, ${row.bill}, 30, current_date, 'CASH', null
      )
    `;
    expect(second[0]?.shop_collect_invoice_once).toBe("exceeds_balance");
    const [money] = await sql<{ paid: string }[]>`
      select coalesce(sum(amount), 0)::text as paid from payments where invoice_id = ${row.bill}
    `;
    expect(Number(money?.paid)).toBe(15);
  });

  it("cancels an unpaid bill once and restores the piece", async () => {
    const row = await seedPiece("CAN1", "IN9000105");
    await sql`select shop_add_invoice_line(
      ${row.bill}, ${row.customer}, ${row.stock}, ${row.product},
      'IN9000105', 1, 1, 40, 40, true
    )`;
    const outcome = await sql<{ shop_cancel_invoice: string }[]>`
      select shop_cancel_invoice(${row.bill}, 'customer changed their mind')
    `;
    expect(outcome[0]?.shop_cancel_invoice).toBe("ok");
    const again = await sql<{ shop_cancel_invoice: string }[]>`
      select shop_cancel_invoice(${row.bill}, 'customer changed their mind')
    `;
    expect(again[0]?.shop_cancel_invoice).toBe("cancelled");
    const [left] = await sql<{ quantity: string; status: string }[]>`
      select quantity::text, status from inventory_items where id = ${row.stock}
    `;
    expect(Number(left?.quantity)).toBe(1);
    expect(left?.status).toBe("available");
  });

  it("rolls back a failed sale so stock and lines stay together", async () => {
    const row = await seedPiece("RB1", "IN9000106");
    await expect(
      sql.begin(async (tx) => {
        await tx`update inventory_items set quantity = 0, status = 'sold' where id = ${row.stock}`;
        throw new Error("stop");
      }),
    ).rejects.toThrow("stop");
    const [left] = await sql<{ quantity: string; lines: string }[]>`
      select quantity::text, (select count(*)::text from invoice_lines where invoice_id = ${row.bill}) as lines
      from inventory_items where id = ${row.stock}
    `;
    expect(Number(left?.quantity)).toBe(1);
    expect(left?.lines).toBe("0");
  });

  it("keeps the printed product name after a rename and blocks deletion", async () => {
    const row = await seedPiece("NM1", "IN9000107");
    await sql`select shop_add_invoice_line(
      ${row.bill}, ${row.customer}, ${row.stock}, ${row.product},
      'IN9000107', 1, 1, 40, 40, true
    )`;
    await sql`update products set name = 'Renamed blouse', code = 'NM1B' where id = ${row.product}`;
    const [line] = await sql<{ product_name: string; product_code: string }[]>`
      select product_name, product_code from invoice_lines where invoice_id = ${row.bill}
    `;
    expect(line?.product_name).toBe("NM1");
    expect(line?.product_code).toBe("NM1");
    await expect(sql`delete from products where id = ${row.product}`).rejects.toThrow(/restrict|foreign key/i);
  });

  it("does not let a stock count erase a sale that is already changing quantity", async () => {
    const row = await seedPiece("ST1", "IN9000108");
    const seller = postgres(url, { max: 1 });
    const counter = postgres(url, { max: 1 });
    await seller`begin`;
    await seller`update inventory_items set quantity = 0, status = 'sold' where id = ${row.stock}`;
    await counter`set lock_timeout = '300ms'`;
    await expect(
      counter`select start_stock_count('00000000-0000-4000-8000-000000000001'::uuid, null)`,
    ).rejects.toThrow(/lock|timeout/i);
    await seller`commit`;
    await seller.end();
    await counter.end();
    const [left] = await sql<{ quantity: string }[]>`
      select quantity::text from inventory_items where id = ${row.stock}
    `;
    expect(Number(left?.quantity)).toBe(0);
  });

  it("refuses a shop function and an audit change from a signed-in shop role", async () => {
    const row = await seedPiece("AU1", "IN9000109");
    const limited = postgres(url, { max: 1 });
    await limited`set role authenticated`;
    await expect(
      limited`select public.shop_add_invoice_line_once(
        'blocked-key'::text, 'blocked-hash'::text, null::uuid,
        ${row.bill}::uuid, ${row.customer}::uuid, ${row.stock}::uuid, ${row.product}::uuid,
        'IN9000109'::text, 1::numeric, 1::numeric, 40::numeric, 40::numeric, true
      )`,
    ).rejects.toThrow(/permission denied/i);
    await limited.end();
    await sql`insert into shop_audit (action, record_table, detail) values ('sale_line', 'invoices', '{}'::jsonb)`;
    await expect(sql`update shop_audit set action = 'changed'`).rejects.toThrow(/cannot be changed/i);
    await expect(sql`delete from shop_audit`).rejects.toThrow(/cannot be changed/i);
  });
});
