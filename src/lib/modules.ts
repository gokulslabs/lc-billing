import {
  Boxes,
  ClipboardCheck,
  FileBarChart,
  Receipt,
  LayoutDashboard,
  Scissors,
  Settings,
  ShoppingBag,
  Tag,
  Users,
  UserRound,
  type LucideIcon,
} from "lucide-react";

export type AppModule = {
  key: string;
  label: string;
  blurb: string;
  icon: LucideIcon;
  to?:
    | "/admin/dashboard"
    | "/admin/employees"
    | "/admin/products"
    | "/admin/customers"
    | "/admin/inventory"
    | "/admin/sales"
    | "/admin/stitching"
    | "/admin/settings"
    | "/admin/stock-verification"
    | "/admin/reports"
    | "/admin/expenses";
};

// `to` is set only for modules that are built. Others show as "Soon".
export const MODULES: AppModule[] = [
  { key: "dashboard", label: "Dashboard", blurb: "Today at a glance", icon: LayoutDashboard, to: "/admin/dashboard" },
  { key: "employees", label: "Employees", blurb: "Staff and access", icon: UserRound, to: "/admin/employees" },
  { key: "products", label: "Products", blurb: "Catalogue and prices", icon: Tag, to: "/admin/products" },
  { key: "customers", label: "Customers", blurb: "Contacts and history", icon: Users, to: "/admin/customers" },
  { key: "inventory", label: "Inventory", blurb: "Stock and barcodes", icon: Boxes, to: "/admin/inventory" },
  { key: "sales", label: "Sales & billing", blurb: "Invoices and payments", icon: ShoppingBag, to: "/admin/sales" },
  { key: "expenses", label: "Expenses", blurb: "Daily expenses and income", icon: Receipt, to: "/admin/expenses" },
  { key: "stitching", label: "Stitching", blurb: "Tailoring orders", icon: Scissors, to: "/admin/stitching" },
  { key: "settings", label: "Settings", blurb: "Garments, measurements, and processes", icon: Settings, to: "/admin/settings" },
  { key: "stock-verification", label: "Stock verification", blurb: "Scan the shelf and see what is short", icon: ClipboardCheck, to: "/admin/stock-verification" },
  { key: "reports", label: "Reports", blurb: "Bills, collections, and stock", icon: FileBarChart, to: "/admin/reports" },
];
