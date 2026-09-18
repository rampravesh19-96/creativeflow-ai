import { z } from "zod";
export const campaignInput = z.object({
  name: z.string().min(2).max(100),
  brand: z.string().min(2).max(500),
  objective: z.string().min(2).max(500),
  audience: z.string().min(2).max(500),
  tone: z.string().min(2).max(80),
  channels: z.array(z.string().min(2).max(40)).min(1).max(8),
  keyMessage: z.string().min(2).max(500),
  constraints: z.string().max(1000).optional(),
});
export const strategySchema = z.object({
  summary: z.string().min(1),
  audienceInsight: z.string().min(1),
  keyMessage: z.string().min(1),
  tone: z.string().min(1),
  contentAngles: z.array(z.string()).min(2).max(5),
  headlineVariants: z.array(z.string()).min(3).max(6),
  ctaVariants: z.array(z.string()).min(2).max(5),
  socialCopyVariants: z.array(z.string()).min(2).max(5),
  visualConcepts: z.array(z.string()).min(2).max(5),
});
export type StrategyOutput = z.infer<typeof strategySchema>;
export const assetInput = z.object({
  kind: z.enum(["COPY", "HEADLINE", "SOCIAL_POST", "VISUAL_CONCEPT", "IMAGE"]),
  title: z.string().min(2).max(120),
  instruction: z.string().min(2).max(1200),
});
export const reviewInput = z.object({
  status: z.enum(["APPROVED", "REJECTED"]),
});
