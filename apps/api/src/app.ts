import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pino from "pino";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { Store, createPool } from "./store.js";
import { TextProvider, ProviderError } from "./providers.js";
import { assetInput, campaignInput, reviewInput } from "./schemas.js";
type AuthRequest = Request & { userId?: string };
type Options = {
  store?: Store;
  testUser?: (req: Request) => string | undefined;
  provider?: TextProvider;
};
export function createApp(options: Options = {}) {
  const app = express(),
    store = options.store ?? new Store(createPool()),
    provider = options.provider ?? new TextProvider(),
    logger = pino({
      redact: ["req.headers.authorization", "req.headers.cookie"],
    });
  app.use(pinoHttp({ logger, genReqId: () => randomUUID() }));
  app.use(helmet());
  app.use(
    cors({
      origin: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(","),
      methods: ["GET", "POST", "PATCH"],
    }),
  );
  app.use(express.json({ limit: "100kb" }));
  app.use(
    rateLimit({
      windowMs: 60000,
      limit: 120,
      standardHeaders: true,
      legacyHeaders: false,
    }),
  );
  app.get("/api/v1/health", (_q, r) => r.json({ status: "ok" }));
  if (!options.testUser && process.env.CLERK_SECRET_KEY)
    app.use(clerkMiddleware());
  const auth = (req: AuthRequest, res: Response, next: NextFunction) => {
    let id: string | undefined;
    try {
      id = options.testUser
        ? options.testUser(req)
        : (getAuth(req).userId ?? undefined);
    } catch {
      id = undefined;
    }
    if (!id)
      return res.status(401).json({
        code: "UNAUTHENTICATED",
        message: "Authentication is required.",
        path: req.path,
      });
    req.userId = id;
    next();
  };
  const fail = (
    res: Response,
    path: string,
    code: string,
    message: string,
    status = 404,
  ) => res.status(status).json({ code, message, path });
  const costly = rateLimit({
    windowMs: 60000,
    limit: 12,
    standardHeaders: true,
    legacyHeaders: false,
  });
  app.use("/api/v1", auth);
  app.get("/api/v1/readiness", async (_q, r) => {
    try {
      await store.ready();
      r.json({ status: "ready", database: "connected" });
    } catch {
      r.status(503).json({ status: "not_ready", code: "DATABASE_UNAVAILABLE" });
    }
  });
  app.get("/api/v1/campaigns", async (q: AuthRequest, r, n) => {
    try {
      r.json({ data: await store.listCampaigns(q.userId!) });
    } catch (e) {
      n(e);
    }
  });
  app.post("/api/v1/campaigns", async (q: AuthRequest, r, n) => {
    const p = campaignInput.safeParse(q.body);
    if (!p.success)
      return fail(
        r,
        q.path,
        "VALIDATION_ERROR",
        "Campaign input is invalid.",
        422,
      );
    try {
      r.status(201).json({
        data: await store.createCampaign({ ...p.data, userId: q.userId! }),
      });
    } catch (e) {
      n(e);
    }
  });
  app.get("/api/v1/campaigns/:id", async (q: AuthRequest, r, n) => {
    try {
      const c = await store.getCampaign(q.userId!, String(q.params.id));
      if (!c) return fail(r, q.path, "NOT_FOUND", "Campaign not found.");
      r.json({
        data: {
          campaign: c,
          strategy: await store.strategy(q.userId!, c.id),
          assets: await store.listAssets(q.userId!, c.id),
        },
      });
    } catch (e) {
      n(e);
    }
  });
  app.post(
    "/api/v1/campaigns/:id/strategy",
    costly,
    async (q: AuthRequest, r, n) => {
      const c = await store.getCampaign(q.userId!, String(q.params.id));
      if (!c) return fail(r, q.path, "NOT_FOUND", "Campaign not found.");
      const began = Date.now();
      try {
        const generated = await provider.strategy(c);
        const s = await store.saveStrategy(q.userId!, c.id, generated.output);
        await store.addRun({
          userId: q.userId!,
          campaignId: c.id,
          operation: "strategy",
          provider: generated.provider,
          model: generated.model,
          status: "SUCCEEDED",
          latencyMs: Date.now() - began,
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
          costUsd: generated.costUsd,
          errorCategory: null,
        });
        r.status(201).json({ data: s });
      } catch (e) {
        await store.addRun({
          userId: q.userId!,
          campaignId: c.id,
          operation: "strategy",
          provider: "gemini",
          model: e instanceof ProviderError ? (e.details.model ?? null) : null,
          status: "FAILED",
          latencyMs: Date.now() - began,
          inputTokens: null,
          outputTokens: null,
          costUsd: null,
          errorCategory: e instanceof ProviderError ? e.category : "UNKNOWN",
        });
        n(e);
      }
    },
  );
  app.post(
    "/api/v1/campaigns/:id/assets",
    costly,
    async (q: AuthRequest, r, n) => {
      const p = assetInput.safeParse(q.body);
      if (!p.success)
        return fail(
          r,
          q.path,
          "VALIDATION_ERROR",
          "Asset input is invalid.",
          422,
        );
      let a: Awaited<ReturnType<Store["createAsset"]>> | undefined;
      const began = Date.now();
      try {
        a = await store.createAsset(
          q.userId!,
          String(q.params.id),
          p.data.kind,
          p.data.title,
        );
        const generated = await provider.asset(p.data.instruction, p.data.kind);
        const v = await store.addVersion(q.userId!, a.id, generated.output);
        await store.addRun({
          userId: q.userId!,
          campaignId: a.campaignId,
          operation: p.data.kind === "IMAGE" ? "asset-image" : "asset-copy",
          provider: generated.provider,
          model: generated.model,
          status: "SUCCEEDED",
          latencyMs: Date.now() - began,
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
          costUsd: generated.costUsd,
          errorCategory: null,
        });
        r.status(201).json({
          data: { asset: { ...a, status: "READY" }, version: v },
        });
      } catch (e) {
        if (a) {
          await store.setAsset(q.userId!, a.id, "FAILED");
          await store.addRun({
            userId: q.userId!,
            campaignId: a.campaignId,
            operation: p.data.kind === "IMAGE" ? "asset-image" : "asset-copy",
            provider: p.data.kind === "IMAGE" ? "clipdrop" : "gemini",
            model:
              e instanceof ProviderError ? (e.details.model ?? null) : null,
            status: "FAILED",
            latencyMs: Date.now() - began,
            inputTokens: null,
            outputTokens: null,
            costUsd: null,
            errorCategory: e instanceof ProviderError ? e.category : "UNKNOWN",
          });
        }
        n(e);
      }
    },
  );
  app.post(
    "/api/v1/assets/:id/regenerate",
    costly,
    async (q: AuthRequest, r, n) => {
      const a = await store.getAsset(q.userId!, String(q.params.id));
      if (!a) return fail(r, q.path, "NOT_FOUND", "Asset not found.");
      const began = Date.now();
      try {
        const generated = await provider.asset(
          String(q.body?.instruction ?? a.title),
          a.kind,
        );
        const v = await store.addVersion(q.userId!, a.id, generated.output);
        await store.addRun({
          userId: q.userId!,
          campaignId: a.campaignId,
          operation: a.kind === "IMAGE" ? "asset-image" : "asset-copy",
          provider: generated.provider,
          model: generated.model,
          status: "SUCCEEDED",
          latencyMs: Date.now() - began,
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
          costUsd: generated.costUsd,
          errorCategory: null,
        });
        r.status(201).json({
          data: { asset: await store.getAsset(q.userId!, a.id), version: v },
        });
      } catch (e) {
        await store.addRun({
          userId: q.userId!,
          campaignId: a.campaignId,
          operation: a.kind === "IMAGE" ? "asset-image" : "asset-copy",
          provider: a.kind === "IMAGE" ? "clipdrop" : "gemini",
          model: e instanceof ProviderError ? (e.details.model ?? null) : null,
          status: "FAILED",
          latencyMs: Date.now() - began,
          inputTokens: null,
          outputTokens: null,
          costUsd: null,
          errorCategory: e instanceof ProviderError ? e.category : "UNKNOWN",
        });
        n(e);
      }
    },
  );
  app.get("/api/v1/assets/:id/versions", async (q: AuthRequest, r, n) => {
    try {
      const a = await store.getAsset(q.userId!, String(q.params.id));
      if (!a) return fail(r, q.path, "NOT_FOUND", "Asset not found.");
      r.json({ data: await store.versions(q.userId!, a.id) });
    } catch (e) {
      n(e);
    }
  });
  app.patch("/api/v1/assets/:id/review", async (q: AuthRequest, r, n) => {
    const p = reviewInput.safeParse(q.body);
    if (!p.success)
      return fail(
        r,
        q.path,
        "VALIDATION_ERROR",
        "Review input is invalid.",
        422,
      );
    try {
      const existing = await store.getAsset(q.userId!, String(q.params.id));
      if (!existing) return fail(r, q.path, "NOT_FOUND", "Asset not found.");
      const a = await store.review(q.userId!, existing.id, p.data.status);
      if (!a)
        return fail(
          r,
          q.path,
          "INVALID_TRANSITION",
          "Only ready assets can be reviewed.",
          409,
        );
      r.json({ data: a });
    } catch (e) {
      n(e);
    }
  });
  app.get("/api/v1/generation-runs", async (q: AuthRequest, r, n) => {
    try {
      r.json({
        data: await store.history(q.userId!, Number(q.query.limit ?? 20)),
      });
    } catch (e) {
      n(e);
    }
  });
  app.get("/api/v1/usage", async (q: AuthRequest, r, n) => {
    try {
      r.json({ data: await store.usage(q.userId!) });
    } catch (e) {
      n(e);
    }
  });
  app.use((e: unknown, q: Request, r: Response, next: NextFunction) => {
    void next;
    q.log.error(
      e instanceof ProviderError
        ? {
            err: e.name,
            category: e.category,
            provider: e.details.provider,
            operation: e.details.operation,
            model: e.details.model,
            upstreamStatus: e.details.upstreamStatus,
          }
        : { err: e instanceof Error ? e.name : "unknown" },
      "request failed",
    );
    r.status(e instanceof ProviderError ? 502 : 500).json({
      code: e instanceof ProviderError ? e.category : "INTERNAL_ERROR",
      message:
        e instanceof ProviderError
          ? e.message
          : "An unexpected error occurred.",
      path: q.path,
      requestId: q.id,
    });
  });
  return app;
}
export const app = createApp();
