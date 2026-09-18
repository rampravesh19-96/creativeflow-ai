export interface Campaign {
  id: string;
  name: string;
  brand: string;
  objective: string;
  audience: string;
  tone: string;
  channels: string[];
  keyMessage: string;
  constraints?: string;
  createdAt: string;
}
export interface Asset {
  id: string;
  campaignId: string;
  kind: string;
  title: string;
  status: string;
  createdAt: string;
}
export interface AssetVersion {
  id: string;
  assetId: string;
  sequence: number;
  content: string;
  reviewStatus: "READY" | "APPROVED" | "REJECTED";
  createdAt: string;
}
export interface Strategy {
  summary: string;
  audienceInsight: string;
  keyMessage: string;
  tone: string;
  contentAngles: string[];
  headlineVariants: string[];
  ctaVariants: string[];
  socialCopyVariants: string[];
  visualConcepts: string[];
}
export interface UsageSummary {
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  textGenerations: number;
  imageGenerations: number;
  averageLatencyMs: number | null;
  tokens: number;
  costUsd: number | null;
  recent: GenerationRun[];
}
export interface GenerationRun {
  id: string;
  campaignId: string;
  operation: string;
  provider: string;
  model: string | null;
  status: "SUCCEEDED" | "FAILED";
  latencyMs: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
  errorCategory: string | null;
  createdAt: string;
}
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export class AuthenticationError extends ApiError {}
export class MissingAuthenticationTokenError extends Error {
  constructor() {
    super("A session token is required.");
  }
}
const base = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api/v1";
export const api = {
  async request<T>(
    path: string,
    init: RequestInit = {},
    token?: string,
  ): Promise<T> {
    if (!token) throw new MissingAuthenticationTokenError();
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    const json = await response.json();
    if (response.status === 401)
      throw new AuthenticationError(
        response.status,
        json.message ?? "Authentication is required.",
      );
    if (!response.ok)
      throw new ApiError(response.status, json.message ?? "Request failed");
    return json.data as T;
  },
  campaigns: (token?: string) =>
    api.request<Campaign[]>("/campaigns", {}, token),
  create: (body: Omit<Campaign, "id" | "createdAt">, token?: string) =>
    api.request<Campaign>(
      "/campaigns",
      { method: "POST", body: JSON.stringify(body) },
      token,
    ),
  detail: (id: string, token?: string) =>
    api.request<{
      campaign: Campaign;
      strategy: Strategy | null;
      assets: Asset[];
    }>(`/campaigns/${id}`, {}, token),
  strategy: (id: string, token?: string) =>
    api.request<Strategy>(
      `/campaigns/${id}/strategy`,
      { method: "POST" },
      token,
    ),
  asset: (
    id: string,
    body: { kind: string; title: string; instruction: string },
    token?: string,
  ) =>
    api.request<{ asset: Asset; version: AssetVersion }>(
      `/campaigns/${id}/assets`,
      { method: "POST", body: JSON.stringify(body) },
      token,
    ),
  review: (id: string, status: "APPROVED" | "REJECTED", token?: string) =>
    api.request<Asset>(
      `/assets/${id}/review`,
      { method: "PATCH", body: JSON.stringify({ status }) },
      token,
    ),
  regenerate: (id: string, instruction: string, token?: string) =>
    api.request<{ asset: Asset; version: AssetVersion }>(
      `/assets/${id}/regenerate`,
      { method: "POST", body: JSON.stringify({ instruction }) },
      token,
    ),
  versions: (id: string, token?: string) =>
    api.request<AssetVersion[]>(`/assets/${id}/versions`, {}, token),
  usage: (token?: string) => api.request<UsageSummary>("/usage", {}, token),
  history: (token?: string) =>
    api.request<GenerationRun[]>("/generation-runs", {}, token),
};
