export type AssetStatus =
  "DRAFT" | "GENERATING" | "READY" | "APPROVED" | "REJECTED" | "FAILED";
export type AssetKind =
  "COPY" | "HEADLINE" | "SOCIAL_POST" | "VISUAL_CONCEPT" | "IMAGE";
export interface Campaign {
  id: string;
  userId: string;
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
export interface Strategy {
  id: string;
  campaignId: string;
  summary: string;
  audienceInsight: string;
  keyMessage: string;
  tone: string;
  contentAngles: string[];
  headlineVariants: string[];
  ctaVariants: string[];
  socialCopyVariants: string[];
  visualConcepts: string[];
  createdAt: string;
}
export interface Asset {
  id: string;
  campaignId: string;
  kind: AssetKind;
  title: string;
  status: AssetStatus;
  createdAt: string;
}
export interface AssetVersion {
  id: string;
  assetId: string;
  sequence: number;
  content: string;
  reviewStatus: Exclude<AssetStatus, "DRAFT" | "GENERATING" | "FAILED">;
  createdAt: string;
}
export interface GenerationRun {
  id: string;
  userId: string;
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
