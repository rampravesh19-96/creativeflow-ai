/* eslint-disable @typescript-eslint/no-explicit-any */
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import type {
  Asset,
  AssetKind,
  AssetStatus,
  AssetVersion,
  Campaign,
  GenerationRun,
  Strategy,
} from "./domain.js";

const date = (v: Date | string) => new Date(v).toISOString();
export class Store {
  constructor(private pool: Pool) {}
  async ready() {
    await this.pool.query("SELECT 1");
  }
  async createCampaign(
    x: Omit<Campaign, "id" | "createdAt">,
  ): Promise<Campaign> {
    const r = await this.pool.query(
      "INSERT INTO campaigns(id,user_id,name,brand,objective,audience,tone,channels,key_message,constraints) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *",
      [
        randomUUID(),
        x.userId,
        x.name,
        x.brand,
        x.objective,
        x.audience,
        x.tone,
        JSON.stringify(x.channels),
        x.keyMessage,
        x.constraints ?? null,
      ],
    );
    return campaign(r.rows[0]);
  }
  async getCampaign(user: string, id: string) {
    const r = await this.pool.query(
      "SELECT * FROM campaigns WHERE id=$1 AND user_id=$2",
      [id, user],
    );
    return r.rowCount ? campaign(r.rows[0]) : undefined;
  }
  async listCampaigns(user: string) {
    const r = await this.pool.query(
      "SELECT * FROM campaigns WHERE user_id=$1 ORDER BY created_at DESC",
      [user],
    );
    return r.rows.map(campaign);
  }
  async strategy(user: string, campaign: string) {
    const r = await this.pool.query(
      "SELECT s.* FROM strategies s JOIN campaigns c ON c.id=s.campaign_id WHERE s.campaign_id=$1 AND c.user_id=$2",
      [campaign, user],
    );
    return r.rowCount ? strategy(r.rows[0]) : undefined;
  }
  async saveStrategy(
    user: string,
    campaign: string,
    payload: Omit<Strategy, "id" | "campaignId" | "createdAt">,
  ) {
    const r = await this.pool.query(
      "INSERT INTO strategies(id,campaign_id,payload) SELECT $1,$2,$3 WHERE EXISTS(SELECT 1 FROM campaigns WHERE id=$2 AND user_id=$4) ON CONFLICT(campaign_id) DO UPDATE SET payload=EXCLUDED.payload,created_at=now() RETURNING *",
      [randomUUID(), campaign, JSON.stringify(payload), user],
    );
    if (!r.rowCount) throw new Error("NOT_FOUND");
    return strategy(r.rows[0]);
  }
  async createAsset(
    user: string,
    campaign: string,
    kind: AssetKind,
    title: string,
  ) {
    const r = await this.pool.query(
      "INSERT INTO assets(id,campaign_id,kind,title,status) SELECT $1,$2,$3,$4,'GENERATING' WHERE EXISTS(SELECT 1 FROM campaigns WHERE id=$2 AND user_id=$5) RETURNING *",
      [randomUUID(), campaign, kind, title, user],
    );
    if (!r.rowCount) throw new Error("NOT_FOUND");
    return asset(r.rows[0]);
  }
  async getAsset(user: string, id: string) {
    const r = await this.pool.query(
      "SELECT a.* FROM assets a JOIN campaigns c ON c.id=a.campaign_id WHERE a.id=$1 AND c.user_id=$2",
      [id, user],
    );
    return r.rowCount ? asset(r.rows[0]) : undefined;
  }
  async listAssets(user: string, campaign: string) {
    const r = await this.pool.query(
      "SELECT a.* FROM assets a JOIN campaigns c ON c.id=a.campaign_id WHERE a.campaign_id=$1 AND c.user_id=$2 ORDER BY a.created_at DESC",
      [campaign, user],
    );
    return r.rows.map(asset);
  }
  async setAsset(user: string, id: string, status: AssetStatus) {
    const r = await this.pool.query(
      "UPDATE assets a SET status=$1 FROM campaigns c WHERE a.campaign_id=c.id AND a.id=$2 AND c.user_id=$3 RETURNING a.*",
      [status, id, user],
    );
    return r.rowCount ? asset(r.rows[0]) : undefined;
  }
  async addVersion(user: string, id: string, content: string) {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const o = await c.query(
        "SELECT a.id FROM assets a JOIN campaigns p ON p.id=a.campaign_id WHERE a.id=$1 AND p.user_id=$2 FOR UPDATE",
        [id, user],
      );
      if (!o.rowCount) throw new Error("NOT_FOUND");
      const r = await c.query(
        "INSERT INTO asset_versions(id,asset_id,sequence,content,review_status) VALUES($1,$2,(SELECT COALESCE(MAX(sequence),0)+1 FROM asset_versions WHERE asset_id=$2),$3,'READY') RETURNING *",
        [randomUUID(), id, content],
      );
      await c.query("UPDATE assets SET status='READY' WHERE id=$1", [id]);
      await c.query("COMMIT");
      return version(r.rows[0]);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async versions(user: string, id: string) {
    const r = await this.pool.query(
      "SELECT v.* FROM asset_versions v JOIN assets a ON a.id=v.asset_id JOIN campaigns c ON c.id=a.campaign_id WHERE v.asset_id=$1 AND c.user_id=$2 ORDER BY v.sequence",
      [id, user],
    );
    return r.rows.map(version);
  }
  async review(user: string, id: string, status: "APPROVED" | "REJECTED") {
    const c = await this.pool.connect();
    try {
      await c.query("BEGIN");
      const r = await c.query(
        "UPDATE assets a SET status=$1 FROM campaigns p WHERE a.campaign_id=p.id AND a.id=$2 AND p.user_id=$3 AND a.status='READY' RETURNING a.*",
        [status, id, user],
      );
      if (!r.rowCount) {
        await c.query("ROLLBACK");
        return undefined;
      }
      await c.query(
        "UPDATE asset_versions SET review_status=$1 WHERE id=(SELECT id FROM asset_versions WHERE asset_id=$2 ORDER BY sequence DESC LIMIT 1)",
        [status, id],
      );
      await c.query("COMMIT");
      return asset(r.rows[0]);
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    } finally {
      c.release();
    }
  }
  async addRun(x: Omit<GenerationRun, "id" | "createdAt">) {
    await this.pool.query(
      "INSERT INTO generation_runs(id,user_id,campaign_id,operation,provider,model,status,latency_ms,input_tokens,output_tokens,cost_usd,error_category) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)",
      [
        randomUUID(),
        x.userId,
        x.campaignId,
        x.operation,
        x.provider,
        x.model,
        x.status,
        x.latencyMs,
        x.inputTokens,
        x.outputTokens,
        x.costUsd,
        x.errorCategory,
      ],
    );
  }
  async history(user: string, limit = 20) {
    const r = await this.pool.query(
      "SELECT * FROM generation_runs WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2",
      [user, Math.min(limit, 100)],
    );
    return r.rows.map(run);
  }
  async usage(user: string) {
    const runs = await this.history(user, 100),
      ok = runs.filter((r) => r.status === "SUCCEEDED");
    return {
      totalRuns: runs.length,
      successfulRuns: ok.length,
      failedRuns: runs.length - ok.length,
      textGenerations: runs.filter(
        (r) => r.operation === "strategy" || r.operation === "asset-copy",
      ).length,
      imageGenerations: runs.filter((r) => r.operation === "asset-image")
        .length,
      averageLatencyMs: ok.length
        ? Math.round(ok.reduce((n, r) => n + (r.latencyMs ?? 0), 0) / ok.length)
        : null,
      tokens: ok.reduce((n, r) => n + (r.outputTokens ?? 0), 0),
      costUsd: null,
      recent: runs.slice(0, 10),
    };
  }
}
export const createPool = (url = process.env.DATABASE_URL) =>
  new Pool({ connectionString: url, max: 10 });
const campaign = (r: any): Campaign => ({
  id: r.id,
  userId: r.user_id,
  name: r.name,
  brand: r.brand,
  objective: r.objective,
  audience: r.audience,
  tone: r.tone,
  channels: r.channels,
  keyMessage: r.key_message,
  constraints: r.constraints ?? undefined,
  createdAt: date(r.created_at),
});
const strategy = (r: any): Strategy => ({
  id: r.id,
  campaignId: r.campaign_id,
  ...r.payload,
  createdAt: date(r.created_at),
});
const asset = (r: any): Asset => ({
  id: r.id,
  campaignId: r.campaign_id,
  kind: r.kind,
  title: r.title,
  status: r.status,
  createdAt: date(r.created_at),
});
const version = (r: any): AssetVersion => ({
  id: r.id,
  assetId: r.asset_id,
  sequence: r.sequence,
  content: r.content,
  reviewStatus: r.review_status,
  createdAt: date(r.created_at),
});
const run = (r: any): GenerationRun => ({
  id: r.id,
  userId: r.user_id,
  campaignId: r.campaign_id,
  operation: r.operation,
  provider: r.provider,
  model: r.model,
  status: r.status,
  latencyMs: r.latency_ms,
  inputTokens: r.input_tokens,
  outputTokens: r.output_tokens,
  costUsd: r.cost_usd === null ? null : Number(r.cost_usd),
  errorCategory: r.error_category,
  createdAt: date(r.created_at),
});
