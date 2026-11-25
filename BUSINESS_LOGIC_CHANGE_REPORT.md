# Business logic change report

Ladies Collections, 26 November 2026

This report reviews the uncommitted hardening work sitting on top of the live program. It is written for the boutique, not for a software team.

The live website has not been changed by this work. The last published program is still “Show stock measurement as NO and MT.” Nothing in this review has been deployed, and the new database script has not been applied to the shop database.

## Executive summary

Ten significant changes were reviewed.

- Essential technical fixes: 2
- Internal reliability improvements: 5
- Business behaviour changes: 2
- Potentially overengineered changes: 1
- Changes that need the owner’s approval before release: 2

The daily work on the live site is unchanged today. Staff can still bill, scan, take payment, return goods, cancel a bill, count stock, and print exactly as they do now.

The unpublished program is more complicated than this shop needs. The useful part is small: stop one repeated click from selling the same fabric cut twice, and stop a saved line from looking like a failure. The same unpublished database script also adds an audit log and a frozen product name. Those were not asked for by the shop, and they should not go live until the owner says so.

If the new program is published before the new database script, opening a bill can fail, because the program asks for three columns that do not exist yet. That is a release-order risk, not a change that is already affecting the shop.

## What was checked

- Published program: commit `6a21d1f`, “Show stock measurement as NO and MT.”
- Working copy: 11 edited program files, plus new files that are not published.
- New database script: `drizzle/migrations/0030_sale_idempotency_and_audit.sql`. It was run only on a disposable database on this computer. It was not run on the shop database.
- Tests on 26 November 2026: 116 tests passed, including 10 tests on that disposable database. Typecheck passed. The production build completed. Lint did not pass: 48 formatting complaints, mostly in the old data viewer, not in the billing screens.
- Production bills, stock, customers, and payments were not modified for this review.

## 1. Every major change

### 1. Repeated sale, payment, and return

Original behaviour. Each press of Add sells again. If the fabric is cut and the screen then fails to refresh, the counter can look like the sale failed. A second press sells another cut. A piece (unit NO) was already blocked from going onto two open bills. Cash, UPI, and card payments were also saved again if the same collection was sent twice. A return put stock back once per successful request; a second return of the same remaining quantity could be rejected by the stock check, but a repeated request that arrived before the first finished was not given its own protection.

Behaviour in the unpublished program. The screen now sends a hidden operation number with Add, Return, and Collect. Until the new database script is installed, the server still uses the old sale, payment, and return functions, so a repeated press can still create a second record. After that script is installed, the same operation number and the same details return the original result and do not sell, collect, or return a second time. A different quantity, rate, or discount is treated as a different sale and is allowed. A second genuine cut of the same fabric is still allowed after the first one succeeds, because the screen then creates a new operation number.

Why it was introduced. A verified hole: a fabric sale can succeed in the database and the screen can still show a failure. Staff can then sell the same roll again by mistake.

Requested by the client. No. It was requested in the production-hardening brief, not by the shop.

Defect or prevention. It fixes a demonstrated fabric-sale hole. The payment and return protection is preventive. It was tested on a disposable database, not against the live shop.

What employees can do. On the live site, nothing has changed. After a future release with the database script, employees can still make a second real sale. They cannot accidentally repeat the identical attempt.

New steps. None. Staff do not see or type the operation number.

Existing records. None are rewritten.

If this is reverted. The program returns to today’s behaviour. A failed screen after a successful fabric cut can still lead to a second cut.

Files. `src/lib/operation-id.ts`, `src/server/idempotency.ts`, `src/server/sales.ts`, `src/lib/sales.ts`, `src/routes/_authenticated/admin/sales.tsx`, and the new database script.

Example. Roll IN0003513 has 44 metres. Staff sell 2 metres. The sale is saved, but the screen says it failed. Today, pressing Add again sells 2 more metres and leaves 40. After the database script, the second press of the same attempt leaves 42 metres and shows the original line.

Recommendation. CLIENT APPROVAL REQUIRED before the database script is installed. The idea is justified. The implementation is heavier than the shop needs. See section 4.

### 2. A saved sale that fails to reappear on screen

Original behaviour. If the line, return, or payment was saved but the bill could not be reloaded, the server told the screen that it failed.

Behaviour now, in the unpublished program only. The server says the save succeeded and includes the saved line number when it has one. The screen then refreshes the bill.

Why. So staff are not pushed into repeating a sale that already exists.

Requested by the client. No. It is part of the same defect fix.

What employees can do. They are less likely to be told that a successful save failed. No permission change.

Existing records. None.

If reverted. The misleading failure message can return.

Files. `src/server/sales.ts`.

Recommendation. KEEP. This is the small, direct fix.

### 3. Product name stored on a new bill line

Original behaviour. A bill shows the product code, group, and name from the product card as it stands today. Renaming a product changes how old bills read. The rate and amount on the line were already stored and did not change.

Behaviour in the unpublished database script. A new line also stores the code, name, and group at the moment of sale. Old lines are left blank and still show the live product card. There is no backfill of old bills.

Why. So a later rename does not rewrite history.

Requested by the client. No.

Defect or prevention. Preventive. There is no demonstrated case of a rename corrupting a rupee amount. Amounts were already stored on the line.

What employees can do. They can still rename a product. After the script, a bill made later keeps the old printed name. Bills made before the script still follow the live name.

Existing records. Not changed. New columns are empty until a new sale is made after the script.

If reverted. Bills continue to show the current product card, which is what staff see today.

Files. `drizzle/migrations/0030_sale_idempotency_and_audit.sql`, `src/server/sales.ts`, `src/integrations/supabase/types.ts`.

Example. A line sold as “LC0011 BLOUSE” stays “LC0011 BLOUSE” on that new bill even if the catalogue is later renamed. A bill written before the script still changes its displayed name if the catalogue changes.

Recommendation. CLIENT APPROVAL REQUIRED. Do not treat the current display as a defect unless the owner wants old bills frozen.

### 4. Hidden audit log

Original behaviour. The shop has no separate audit log. The bill, payment, stock movement, and employee records are the record.

Behaviour in the unpublished script. New sales, payments, and returns made through the new functions would also write a row saying who did it, what happened, and when. That log cannot be edited or deleted, even by the database owner, except by removing the protection itself. Expenses, stock corrections, cancellations, and employee changes do not write this log. Nothing is shown on screen. No history is invented for past work.

Why. The hardening brief asked for an audit trail.

Requested by the client. No.

What employees can do. Nothing visible. It does not block a sale, return, payment, or cancellation.

Existing records. No audit rows are created for past work.

If reverted. The shop loses nothing it uses today.

Files. The same database script, inside `shop_add_invoice_line_once`, `shop_collect_invoice_once`, and `shop_return_invoice_line_once`.

Recommendation. DEFER. It is unused by the counter and was not requested by the shop.

### 5. Health addresses

Original behaviour. The program had no public “is it running” address.

Behaviour in the unpublished program. `/api/health` says the program is up. `/api/ready` says whether it can read one product group. Neither address shows passwords, keys, or customer information. They do not require a login.

Why. So a host can check the site without logging in.

Requested by the client. No.

What employees can do. No change to billing.

Recommendation. DEFER. Harmless, but not needed for the counter.

### 6. Dropdowns on five screens

Original behaviour. Product, department, garment, and stock-product dropdowns already worked in the published site.

Behaviour in the unpublished program. The same dropdowns are written in a way the typechecker accepts. An empty choice still shows “Choose”.

Why. Six type errors blocked a clean typecheck. Five of them were these dropdowns.

Requested by the client. No.

What employees can do. No change.

Files. `employees.tsx`, `inventory.tsx`, `products.tsx`, `settings.tsx`, `stitching.tsx`.

Recommendation. KEEP. No workflow change.

### 7. Barcode list when the starting number is not a stock row

Original behaviour. For a manual barcode count, the program prints forward from the number the employee typed. The typechecker was confused by a fallback that could not actually see a stock row in that branch.

Behaviour in the unpublished program. That branch now uses the typed starting number only. That is the same number the old fallback produced when no stock row was present.

Requested by the client. No. The owner previously said to leave the count-up barcode sheets as they are.

What employees can do. Count-up printing is unchanged. The overlap between old and new sheets was not touched.

Files. `src/server/inventory.ts`.

Recommendation. KEEP. This does not change the barcode convention.

### 8. Automated checks

Original behaviour. The program already had unit tests. It did not have a database test that sells the same piece from two connections, and it did not have a hosted check that runs on every publish.

Behaviour now. New tests cover operation numbers and, on a disposable database only, concurrent piece sales, concurrent fabric cuts, repeated payments, repeated returns, partial payment, cancellation, a failed transaction, product rename, product deletion, a stock count blocked by an in-progress quantity change, and a signed-in role being refused the private sale function. A workflow file was added for a future hosted test run. It has not been published and has not run.

Requested by the client. No.

What employees can do. No change.

Recommendation. KEEP the tests. DEFER turning on the hosted workflow until the owner wants that publish step.

### 9. Database script as a whole

The script is the only schema change in this work. It is not installed on the shop database. Details are in section 6.

Recommendation. Do not install it as one bundle. The sale-repeat protection can be kept in a smaller form. The audit log and the frozen product name should wait.

### 10. What was started and is not a behaviour change

Local test database files, test-only helpers, and TypeScript descriptions of the new columns. They do not run in the shop.

## 2. Module by module

Sales and billing. Unpublished change only: a hidden operation number on Add, and a kinder result when a saved line cannot be reloaded. Live billing is unchanged. A second real sale of the same fabric is still possible after the first success.

Inventory and stock adjustments. No change to receiving stock, editing a quantity, or the next inventory number. Barcode count-up is unchanged, as recorded above.

Product management. No change to creating, editing, or deleting a product in the live shop. The unpublished script would keep a new bill’s printed name if the catalogue is later renamed, and it would still refuse to delete a product that is on a bill. That refusal already exists.

Barcode generation and scanning. Unchanged. A fast scan on a bill opened from the list still adds the line. A scan on a brand-new bill still fills the item and waits for Add. Count-up sheets were not changed. The old overlapping ranges were not “corrected.”

Customer management. No change. Duplicate phone numbers are still allowed. Book notes were not changed.

Payments and outstanding balances. Live rules are unchanged: the amount must be positive and cannot be more than the balance. Modes are unchanged. The unpublished script would ignore a repeated identical collection after it is installed. A smaller second payment is still a different collection and is still allowed up to the balance.

Discounts and pricing. No change. Group discount, extra off, and stored line amounts work as they do now.

Returns and cancellations. Live cancel and return rules are unchanged. Any signed-in shop user who can open the bill can still cancel it. The unpublished script adds repeat protection for a return only. Cancellation was not restricted and was not given an operation number.

Stitching orders and measurements. No business change. One dropdown was retyped so the checker accepts it. Saved measurement labels were not renamed.

Expenses. No change. No audit row is written for an expense.

Stock verification. No change to how a count is started or saved. A disposable-database test showed that a count waits, and then gives up, if another connection is already changing a quantity. That lock already existed. It was not added by this work.

Reports and exports. No change. Admin-only export rules were not changed.

Employee permissions. No change. Admin and staff rights are the same as in the published program. Both current logins remain able to do what they can do today. This review does not propose taking cancellation, expenses, or stock edits away from staff.

Authentication. No change to login, password rules, or who receives a role. The new health addresses do not reveal customer or staff data.

Settings. No change to garments, processes, or measurement lists.

## 3. Classification

| Change | Class |
| --- | --- |
| Kinder message when a sale, return, or payment saved but the bill failed to reload | A. Essential technical fix |
| Dropdowns rewritten so the typechecker accepts them | B. Internal reliability |
| Barcode branch uses the typed starting number | B. Internal reliability |
| Tests and the unpublished hosted-check file | B. Internal reliability |
| Health addresses | B. Internal reliability |
| Hidden operation number for an identical repeated sale, payment, or return | C. Business behaviour, and only after the database script is installed |
| Store product code, name, and group on new bill lines | C. Business behaviour for bills created after the script |
| Audit log that cannot be edited | D. Unrequested |
| Bundling audit, frozen names, and repeat protection into one database script | D. More machinery than the defect needs |

Nothing in this review is classed as essential merely because a larger retail system would do it.

No item is classed as uncertain. Where the shop’s intention was already documented, that intention is treated as the requirement. Barcode count-up and the excluded historical salwar slips were left alone.

## 4. Complexity

The repeat-sale hole is real. The screen already refuses a second Add while the first request is still running. The hole that remains is a request that saved, then looked as if it failed, followed by another press.

A simpler protection would be enough: remember one operation number on the bill line or payment, and if the same number arrives again, return the first result. That is one unique number, not a general operations register.

What was written instead:

- A new `shop_operations` table.
- Three new database functions wrapped around sale, payment, and return.
- A hash of the request, so the same number cannot be reused for a different quantity.
- A client memory of the last attempt.
- A fallback to the old function when the new one is missing.
- An audit table and a trigger that blocks any change to it.
- Three new columns on every future bill line.

Practical benefit. After the script is installed, one repeated identical attempt cannot sell, collect, or restore stock twice. Two connections cannot both take the last piece or the same fabric reading. Those two races were tested on the disposable database.

Cost. The counter does not see any of this, but the next person who maintains the shop program has more functions to keep in step. Publishing the program without the script can stop bills from opening, because the program now reads the three new columns.

A simpler release would keep the kinder save message and one unique operation number. It would leave the audit log and the frozen product name out until the owner asks.

No new paid service, barcode library, or hosting product was added. The hosted-check file does not cost anything until it is turned on. The disposable database used for tests is on this computer and is not the shop database.

These were not added, and should not be treated as defects:

- GST or HSN.
- Profit.
- Supplier ledgers.
- Size and colour variants.
- Merging duplicate customers.
- Removing the extra product codes LC0011 and BS-0049.
- Deleting bill 1876.
- Importing the salwar slips that were intentionally left on the old site.
- Changing who may cancel, edit an expense, or adjust stock.

## 5. Database script, in plain language

Script: `0030_sale_idempotency_and_audit.sql`. Status: written, tested on a disposable database, not installed for the shop.

New tables.

- `shop_operations`. Remembers an operation number, a fingerprint of the request, the bill, and the result. Purpose: recognise a repeat. It does not contain customer phone numbers or passwords.
- `shop_audit`. Remembers who performed a new sale, payment, or return. Purpose: a log. Staff cannot open it in the program.

New columns on `invoice_lines`.

- `product_code`, `product_name`, and `group_name`. Empty for every existing line. Filled only for a line created after the script, and only by the replaced sale function.

Changed function.

- `shop_add_invoice_line` is replaced. Stock rules stay the same: the quantity must still match what the counter saw, a piece still cannot sit on two open bills, and a failure still undoes the stock change. The addition is that the new line copies the product code, name, and group.

New functions.

- `shop_operation_state`. Decides whether an operation number is new, a repeat, or a mismatch.
- `shop_add_invoice_line_once`, `shop_collect_invoice_once`, and `shop_return_invoice_line_once`. Do the existing work once, then store the operation number and an audit row.
- `shop_audit_frozen`. Refuses updates and deletions on the audit table.

New trigger.

- `shop_audit_no_change`, before any update or delete of an audit row.

No new index beyond the operation number, which is the table’s identity. No new row-level policy that lets the shop screens read these tables. Both new tables are locked to the server login. The signed-in shop role was tested and cannot call the new sale function or use the public schema for it.

Could existing rows be rejected. No. The new columns are optional. No existing bill, payment, or stock row is updated by the script.

Could a previously valid sale be rejected. Only a repeated identical attempt, and only after the script is installed. A new operation number still sells again. A payment larger than the balance is still rejected, as it is today. A cancel of a bill that already has a payment is still rejected, as it is today.

Previous program version. The published program does not know these tables. It keeps working if the script is installed, because the old function names remain. The unpublished program does not keep working if it is published first: reading a bill asks for the three new columns.

Migration risk. Install the script before any program that reads those columns. Take a backup first. Do not install it while a sale is being used as the test. The script itself does not delete or renumber bills.

## 6. Decision table

| Change | Original behaviour | New behaviour | Classification | Client impact | Risk | Recommendation |
| --- | --- | --- | --- | --- | --- | --- |
| Kinder result after a saved sale, return, or payment | A saved change could look like a failure | The screen is told the save worked, then it refreshes | A | Staff are less likely to repeat a saved fabric cut | Low. Unpublished | KEEP |
| Dropdown typing | Dropdowns already worked | Same dropdowns, accepted by the typechecker | B | None | None | KEEP |
| Barcode starting number | Count forward from the typed number | Same count-up | B | None. Barcode convention kept | None | KEEP |
| Disposable-database tests | Those races were not automatically tested | Ten database cases passed locally | B | None | None if they stay pointed away from the shop database | KEEP |
| Hosted check file | No automatic publish check | A file exists and has not run | B | None until it is turned on | None today | DEFER |
| Health addresses | No public status address | Two addresses say up or not ready | B | None on the counter | They are public but reveal no shop data | DEFER |
| Repeat protection for the same sale, payment, or return | A repeated identical request could write again | After the script, the same attempt returns the first result | C | No new step. A second genuine sale still works | Publishing the program before the script can stop bills opening | CLIENT APPROVAL REQUIRED |
| Frozen product name on new lines | Old bills follow the current product card | New lines keep the name from sale time. Old lines do not change | C | A rename no longer rewrites newer bills | Old bills are not frozen. Easy to mistake that for a full history fix | CLIENT APPROVAL REQUIRED |
| Audit log | No separate log | Hidden rows for new sales, payments, and returns. Not for expenses, stock, or staff changes | D | No screen change | Extra table that even the owner cannot edit through normal database edits | DEFER |
| One combined database script | Shop database is the published schema | Script adds all of the above together | D | Nothing until someone installs it | Too much to install for one defect | SIMPLIFY |

## 7. Release position

Do not publish this working copy yet.

The live boutique workflow remains the one staff used this morning. This unpublished work does not justify a release by itself. The part worth keeping is the protection against repeating one fabric sale. The audit log and the frozen names are not required for that, and they need the owner’s decision.

A full go-live is still not claimed. Backup restore, hosted monitoring, and a full counter rehearsal in a browser were not done in this pass, and they are not described here as done.
