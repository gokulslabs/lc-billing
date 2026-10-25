import { describe, expect, it } from "vitest";
import { api } from "./api";

describe("employees API", () => {
  it("asks for a session before any staff data", async () => {
    const response = await api.request("/api/employees");
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Sign in required.");
  });

  it("asks for a session before the dashboard", async () => {
    const response = await api.request("/api/dashboard");
    expect(response.status).toBe(401);
  });

  it("asks for a session before the catalogue", async () => {
    const response = await api.request("/api/products");
    expect(response.status).toBe(401);
  });

  it("asks for a session before customers", async () => {
    const response = await api.request("/api/customers");
    expect(response.status).toBe(401);
  });

  it("asks for a session before bills", async () => {
    const response = await api.request("/api/invoices");
    expect(response.status).toBe(401);
  });

  it("asks for a session before stitching orders", async () => {
    const response = await api.request("/api/stitching-orders");
    expect(response.status).toBe(401);
  });

  it("asks for a session before reports", async () => {
    const response = await api.request("/api/reports/invoices");
    expect(response.status).toBe(401);
  });

  it("asks for a session before settings", async () => {
    const response = await api.request("/api/settings");
    expect(response.status).toBe(401);
  });

  it("asks for a session before stock", async () => {
    const response = await api.request("/api/inventory");
    expect(response.status).toBe(401);
  });
});