import {
  Boxes,
  FileBarChart,
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
  to?: "/dashboard" | "/employees" | "/products" | "/customers" | "/inventory" | "/sales" | "/stitching" | "/settings" | "/reports";
};

// `to` is set only for modules that are built. Others show as "Soon".
export const MODULES: AppModule[] = [
  { key: "dashboard", label: "Dashboard", blurb: "Today at a glance", icon: LayoutDashboard, to: "/dashboard" },
  { key: "employees", label: "Employees", blurb: "Staff and access", icon: UserRound, to: "/employees" },
  { key: "products", label: "Products", blurb: "Catalogue and prices", icon: Tag, to: "/products" },
  { key: "customers", label: "Customers", blurb: "Contacts and history", icon: Users, to: "/customers" },
  { key: "inventory", label: "Inventory", blurb: "Stock and barcodes", icon: Boxes, to: "/inventory" },
  { key: "sales", label: "Sales & billing", blurb: "Invoices and payments", icon: ShoppingBag, to: "/sales" },
  { key: "stitching", label: "Stitching", blurb: "Tailoring orders", icon: Scissors, to: "/stitching" },
  { key: "settings", label: "Settings", blurb: "Garments, measurements, and processes", icon: Settings, to: "/settings" },
  { key: "reports", label: "Reports", blurb: "Bills, collections, and stock", icon: FileBarChart, to: "/reports" },
];
