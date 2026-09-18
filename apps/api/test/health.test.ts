import request from "supertest";
import { describe, expect, it } from "vitest";
import { app } from "../src/app.js";

describe("health endpoint", () => {
  it("reports a healthy process without authentication", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: "ok" });
  });

  it("rejects unauthenticated campaign access", async () => {
    const response = await request(app).get("/api/v1/campaigns");
    expect(response.status).toBe(401);
  });
});
