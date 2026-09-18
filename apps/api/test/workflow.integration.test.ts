import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { ProviderError, TextProvider } from "../src/providers.js";
import { createPool, Store } from "../src/store.js";

const url = process.env.TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
describeDb("PostgreSQL workflow", () => {
  const pool = createPool(url);
  const app = createApp({
    store: new Store(pool),
    testUser: (req) => req.header("x-integration-user") ?? undefined,
  });
  const as = (user: string) => ({
    get: (path: string) =>
      request(app).get(path).set("x-integration-user", user),
    post: (path: string) =>
      request(app).post(path).set("x-integration-user", user),
    patch: (path: string) =>
      request(app).patch(path).set("x-integration-user", user),
  });
  let campaignId = "";
  let assetId = "";
  beforeAll(async () => {
    process.env.AI_PROVIDER_MODE = "mock";
    await pool.query("SELECT 1");
  });
  afterAll(async () => {
    await pool.end();
  });
  it("uses real DB readiness, validation, auth, ownership, and campaign persistence", async () => {
    expect((await request(app).get("/api/v1/health")).status).toBe(200);
    expect((await as("user-a").get("/api/v1/readiness")).status).toBe(200);
    expect((await request(app).get("/api/v1/campaigns")).status).toBe(401);
    expect((await as("user-a").post("/api/v1/campaigns").send({})).status).toBe(
      422,
    );
    const created = await as("user-a")
      .post("/api/v1/campaigns")
      .send({
        name: "Integration brief",
        brand: "CreativeFlow",
        objective: "Launch",
        audience: "Marketing teams",
        tone: "Clear",
        channels: ["LinkedIn"],
        keyMessage: "Reviewable work",
      });
    expect(created.status).toBe(201);
    campaignId = created.body.data.id;
    expect(
      (await as("user-a").get(`/api/v1/campaigns/${campaignId}`)).body.data
        .campaign.id,
    ).toBe(campaignId);
    expect(
      (await as("user-b").get(`/api/v1/campaigns/${campaignId}`)).status,
    ).toBe(404);
  });
  it("persists strategy, assets, versions, review, history, and usage", async () => {
    const strategy = await as("user-a").post(
      `/api/v1/campaigns/${campaignId}/strategy`,
    );
    expect(strategy.status).toBe(201);
    expect(
      (await as("user-a").get(`/api/v1/campaigns/${campaignId}`)).body.data
        .strategy.id,
    ).toBe(strategy.body.data.id);
    const made = await as("user-a")
      .post(`/api/v1/campaigns/${campaignId}/assets`)
      .send({
        kind: "COPY",
        title: "Launch copy",
        instruction: "Write launch copy",
      });
    expect(made.status).toBe(201);
    assetId = made.body.data.asset.id;
    expect(made.body.data.version.sequence).toBe(1);
    const regenerated = await as("user-a")
      .post(`/api/v1/assets/${assetId}/regenerate`)
      .send({ instruction: "A second copy" });
    expect(regenerated.body.data.version.sequence).toBe(2);
    expect(
      (await as("user-a").get(`/api/v1/assets/${assetId}/versions`)).body.data,
    ).toHaveLength(2);
    expect(
      (
        await as("user-a")
          .patch(`/api/v1/assets/${assetId}/review`)
          .send({ status: "APPROVED" })
      ).status,
    ).toBe(200);
    expect(
      (
        await as("user-a")
          .patch(`/api/v1/assets/${assetId}/review`)
          .send({ status: "REJECTED" })
      ).status,
    ).toBe(409);
    expect(
      (await as("user-b").get(`/api/v1/assets/${assetId}/versions`)).status,
    ).toBe(404);
    expect(
      (await as("user-a").get("/api/v1/generation-runs")).body.data.length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      (await as("user-a").get("/api/v1/usage")).body.data.totalRuns,
    ).toBeGreaterThanOrEqual(2);
  });
  it("records a failed asset run without making a failed asset ready", async () => {
    class FailingProvider extends TextProvider {
      override async asset() {
        throw new ProviderError("TIMEOUT", "Timed out for test.");
      }
    }
    const failingApp = createApp({
      store: new Store(pool),
      provider: new FailingProvider(),
      testUser: (req) => req.header("x-integration-user") ?? undefined,
    });
    const response = await request(failingApp)
      .post(`/api/v1/campaigns/${campaignId}/assets`)
      .set("x-integration-user", "user-a")
      .send({
        kind: "IMAGE",
        title: "Unavailable visual",
        instruction: "A launch visual",
      });
    expect(response.status).toBe(502);
    const detail = await as("user-a").get(`/api/v1/campaigns/${campaignId}`);
    const failed = detail.body.data.assets.find(
      (asset: { title: string }) => asset.title === "Unavailable visual",
    );
    expect(failed.status).toBe("FAILED");
    expect(
      (await as("user-a").get(`/api/v1/assets/${failed.id}/versions`)).body
        .data,
    ).toEqual([]);
    const runs = (await as("user-a").get("/api/v1/generation-runs")).body.data;
    expect(runs[0]).toMatchObject({
      operation: "asset-image",
      provider: "clipdrop",
      status: "FAILED",
      errorCategory: "TIMEOUT",
    });
  });
});
