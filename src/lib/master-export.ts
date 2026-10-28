import { apiFetch } from "@/lib/api";
import type { Customer } from "@/lib/customers";
import type { Employee } from "@/lib/employees";
import { formatPurchaseNumbers, type InventoryItem, type PurchaseLine } from "@/lib/inventory";
import type { ExcelSheet } from "@/lib/excel";
import type { Product, ProductGroup } from "@/lib/products";
import { billStatusLabel, shopToday, type InvoiceItem, type InvoiceSummary } from "@/lib/sales";
import type { StitchingGarment, StitchingProcess } from "@/lib/settings";
import type { StitchingOrder } from "@/lib/stitching";

const FIRST_DAY = "2000-01-01";

type StockGroup = { name: string; quantity: number; amount: number };

type PaymentRow = {
  paidOn: string;
  billNo: string;
  customerName: string;
  mode: string | null;
  showroom: string | null;
  amount: number;
};

function paymentMode(mode: string | null): string {
  if (mode === "CASH") return "Cash";
  if (mode === "UPI") return "UPI";
  if (mode === "CARD") return "Card";
  return "Not recorded";
}

function receiptBlank(value: string): string {
  return value.trim() ? value : "Migrated — not recorded";
}

function billRows(bills: InvoiceSummary[]): ExcelSheet["rows"] {
  return bills.map((bill) => [
    bill.billNo,
    bill.billedOn,
    bill.customerName,
    bill.gross,
    bill.discount,
    bill.total,
    bill.collected,
    bill.balance,
    billStatusLabel(bill.status),
  ]);
}

const BILL_COLUMNS = ["Bill no.", "Date", "Customer", "Gross", "Discount", "Net", "Collected", "Balance", "Status"];

export async function loadMasterExportFrom(get: <T>(path: string) => Promise<T>): Promise<ExcelSheet[]> {
  const today = shopToday();
  const dates = `from=${FIRST_DAY}&to=${today}`;
  const [
    customers,
    products,
    groups,
    employees,
    stock,
    current,
    purchases,
    bills,
    items,
    payments,
    unrecorded,
    liveDue,
    oldDue,
    orders,
    settings,
  ] = await Promise.all([
    get<{ customers: Customer[] }>("/api/customers?export=1"),
    get<{ products: Product[] }>("/api/products?picker=1"),
    get<{ groups: ProductGroup[] }>("/api/product-groups"),
    get<{ employees: Employee[] }>("/api/employees"),
    get<{ items: InventoryItem[] }>("/api/inventory?export=1"),
    get<{ groups: StockGroup[] }>("/api/inventory/summary"),
    get<{ purchases: PurchaseLine[]; truncated: boolean }>(`/api/inventory/purchases?${dates}`),
    get<{ invoices: InvoiceSummary[] }>(`/api/invoices?${dates}&export=1`),
    get<{ items: InvoiceItem[] }>(`/api/invoices/items?${dates}&export=1`),
    get<{ payments: PaymentRow[] }>(`/api/reports/showrooms?${dates}`),
    get<{ invoices: InvoiceSummary[] }>("/api/invoices/unrecorded?export=1"),
    get<{ invoices: InvoiceSummary[] }>("/api/invoices/due?books=new&export=1"),
    get<{ invoices: InvoiceSummary[] }>("/api/invoices/due?books=old&export=1"),
    get<{ orders: StitchingOrder[] }>("/api/stitching-orders?export=1"),
    get<{ garments: StitchingGarment[]; processes: StitchingProcess[] }>("/api/settings"),
  ]);
  if (purchases.truncated) throw new Error("Purchases did not all fit in the export.");

  return [
    {
      name: "Customers",
      columns: ["Name", "Phone", "Book no.", "Address"],
      rows: customers.customers.map((customer) => [customer.name, customer.phone ?? "", customer.bookNo ?? "", customer.address ?? ""]),
    },
    {
      name: "Products",
      columns: ["Code", "Group", "Name", "Unit", "Price", "Group discount %"],
      rows: products.products.map((product) => [product.code, product.groupName, product.name, product.unit, product.price, product.discountPercent]),
    },
    {
      name: "Groups",
      columns: ["Group", "Code", "Discount %", "Products"],
      rows: groups.groups.map((group) => [group.name, group.code, group.discountPercent, group.productCount]),
    },
    {
      name: "Employees",
      columns: ["Name", "Email", "Mobile", "Department", "Gender", "Address", "Access"],
      rows: employees.employees.map((employee) => [
        employee.fullName,
        employee.email,
        employee.mobile ?? "",
        employee.department,
        employee.gender ?? "",
        employee.address ?? "",
        employee.role,
      ]),
    },
    {
      name: "Stock",
      columns: ["Inventory no.", "Code", "Product", "Group", "Unit", "Price", "Quantity", "Status"],
      rows: stock.items.map((item) => [item.inventoryNo, item.productCode, item.productName, item.groupName, item.unit, item.price, item.quantity, item.status]),
    },
    {
      name: "Current stock",
      columns: ["Group", "Quantity", "Amount"],
      rows: current.groups.map((group) => [group.name, group.quantity, group.amount]),
    },
    {
      name: "Purchases",
      columns: ["Date", "Product code", "Product group", "Product name", "Supplier", "Supplier bill", "Cost", "Quantity", "Unit", "Inventory nos."],
      rows: purchases.purchases.map((row) => [
        row.date,
        row.productCode,
        row.groupName,
        row.productName,
        receiptBlank(row.supplierName),
        receiptBlank(row.supplierBillNo),
        row.cost,
        row.quantity,
        row.unit,
        formatPurchaseNumbers(row.inventoryNos),
      ]),
    },
    { name: "Bills", columns: BILL_COLUMNS, rows: billRows(bills.invoices) },
    {
      name: "Bill items",
      columns: ["Bill no.", "Date", "Customer", "Inventory no.", "Code", "Group", "Product", "Qty", "Rate", "Amount"],
      rows: items.items.map((item) => [
        item.billNo,
        item.billedOn,
        item.customerName,
        item.inventoryNo,
        item.productCode,
        item.groupName,
        item.productName,
        item.quantity,
        item.rate,
        item.amount,
      ]),
    },
    {
      name: "Payments",
      columns: ["Date", "Bill no.", "Customer", "Method", "Showroom", "Amount"],
      rows: payments.payments.map((row) => [
        row.paidOn,
        row.billNo || "",
        row.customerName || "",
        paymentMode(row.mode),
        row.showroom || "",
        row.amount,
      ]),
    },
    {
      name: "Not recorded",
      columns: ["Bill no.", "Date", "Net", "Collected", "Balance", "Status"],
      rows: unrecorded.invoices.map((bill) => [bill.billNo, bill.billedOn, bill.total, bill.collected, bill.balance, billStatusLabel(bill.status)]),
    },
    { name: "Unpaid live", columns: BILL_COLUMNS, rows: billRows(liveDue.invoices) },
    { name: "Unpaid old", columns: BILL_COLUMNS, rows: billRows(oldDue.invoices) },
    {
      name: "Orders",
      columns: ["Order", "Bag", "Customer", "Phone", "Garment", "Ordered", "Delivery", "Status", "Amount"],
      rows: orders.orders.map((order) => [
        order.orderNo,
        order.bagNo ?? "",
        order.customerName,
        order.customerPhone,
        order.productName,
        order.orderedOn,
        order.deliveryOn ?? "",
        order.status,
        order.amount,
      ]),
    },
    {
      name: "Garments",
      columns: ["Garment"],
      rows: settings.garments.map((garment) => [garment.name]),
    },
    {
      name: "Measurements",
      columns: ["Garment", "Field"],
      rows: settings.garments.flatMap((garment) => garment.measurements.map((field) => [garment.name, field.label])),
    },
    {
      name: "Processes",
      columns: ["Process"],
      rows: settings.processes.map((process) => [process.name]),
    },
  ];
}

export function loadMasterExport(): Promise<ExcelSheet[]> {
  return loadMasterExportFrom(apiFetch);
}
