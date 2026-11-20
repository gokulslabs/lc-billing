export type ReportAnalytics = {
  summary: {
    bill_count: number;
    net_sales: number;
    collected: number;
    stocked_styles: number;
    catalogue_styles: number;
    retail_stock_value: number;
    paying_customers: number;
    customer_count: number;
  };
  bucket: "day" | "month";
  trend: { date: string; label: string; sales: number; collected: number }[];
  paymentMethods: { method: string; collected: number }[];
  topProducts: {
    code: string;
    name: string;
    unit: string;
    quantitySold: number;
    netSales: number;
  }[];
  topCustomers: { name: string; billCount: number; netSales: number; collected: number }[];
  inventoryGroups: {
    name: string;
    stockedStyles: number;
    quantity: number;
    retailValue: number;
  }[];
};
