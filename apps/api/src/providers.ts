import OpenAI from "openai";
import axios from "axios";
import { v2 as cloudinary } from "cloudinary";
import { strategySchema, type StrategyOutput } from "./schemas.js";
import type { AssetKind, Campaign } from "./domain.js";

export const defaultGeminiModel = "gemini-3.5-flash-lite";
export const geminiModel = process.env.GEMINI_MODEL ?? defaultGeminiModel;
const geminiTimeoutMs = 45_000;
export type ProviderResult<T> = {
  output: T;
  provider: string;
  model: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  costUsd: number | null;
};
export class ProviderError extends Error {
  constructor(
    public category:
      | "CONFIGURATION"
      | "TIMEOUT"
      | "RATE_LIMITED"
      | "AUTHENTICATION"
      | "PERMISSION"
      | "INVALID_REQUEST"
      | "NOT_FOUND"
      | "UNAVAILABLE"
      | "MALFORMED_OUTPUT",
    message: string,
    public details: {
      provider?: "gemini" | "clipdrop";
      operation?: "strategy" | "copy" | "image";
      model?: string | null;
      upstreamStatus?: number;
    } = {},
  ) {
    super(message);
  }
}
const mockStrategy: StrategyOutput = {
  summary: "A focused campaign built around a clear customer outcome.",
  audienceInsight:
    "The audience values clarity, confidence, and practical proof.",
  keyMessage: "Make the next creative decision easier and more consistent.",
  tone: "Confident, concise, and useful",
  contentAngles: [
    "From brief to approved asset",
    "Human review keeps teams in control",
  ],
  headlineVariants: [
    "Turn briefs into reviewable creative work",
    "A clearer path from campaign brief to final asset",
    "Creative production with human approval built in",
  ],
  ctaVariants: ["Build a campaign", "Review the creative plan"],
  socialCopyVariants: [
    "A structured creative workflow gives teams a better starting point.",
    "AI can accelerate a brief without removing human judgement.",
  ],
  visualConcepts: [
    "A campaign board moving from brief to approval",
    "A clean split view of strategy and approved assets",
  ],
};
const mock = <T>(output: T): ProviderResult<T> => ({
  output,
  provider: "mock",
  model: null,
  inputTokens: null,
  outputTokens: null,
  costUsd: null,
});
const tokens = (
  usage: { prompt_tokens?: number; completion_tokens?: number } | undefined,
) => ({
  inputTokens: usage?.prompt_tokens ?? null,
  outputTokens: usage?.completion_tokens ?? null,
});
export const providerError = (
  error: unknown,
  message: string,
  details: ProviderError["details"],
) => {
  const name = (error as { name?: string } | undefined)?.name ?? "";
  const code = (error as { code?: string } | undefined)?.code;
  const status = (error as { status?: number } | undefined)?.status;
  const detail = status ? ` (provider HTTP ${status})` : "";
  const category =
    name === "APIConnectionTimeoutError" ||
    code === "ECONNABORTED" ||
    code === "ETIMEDOUT"
      ? "TIMEOUT"
      : status === 429
        ? "RATE_LIMITED"
        : status === 401
          ? "AUTHENTICATION"
          : status === 403
            ? "PERMISSION"
            : status === 400
              ? "INVALID_REQUEST"
              : status === 404
                ? "NOT_FOUND"
                : "UNAVAILABLE";
  return new ProviderError(category, `${message}${detail}`, {
    ...details,
    upstreamStatus: status,
  });
};

export class TextProvider {
  private client() {
    if (!process.env.GEMINI_API_KEY)
      throw new ProviderError(
        "CONFIGURATION",
        "AI generation is not configured.",
      );
    return new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
      timeout: geminiTimeoutMs,
    });
  }
  private async complete(prompt: string) {
    try {
      const response = await this.client().chat.completions.create({
        model: geminiModel,
        max_completion_tokens: 800,
        messages: [
          {
            role: "system",
            content:
              "You are a concise B2B creative strategist. Return only the requested content.",
          },
          { role: "user", content: prompt },
        ],
      });
      const content = response.choices[0]?.message.content;
      if (!content)
        throw new ProviderError(
          "MALFORMED_OUTPUT",
          "The provider returned no generated content.",
        );
      return { content, ...tokens(response.usage) };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      throw providerError(error, "AI generation could not be completed.", {
        provider: "gemini",
        operation: "copy",
        model: geminiModel,
      });
    }
  }
  async strategy(campaign: Campaign): Promise<ProviderResult<StrategyOutput>> {
    if (process.env.AI_PROVIDER_MODE === "mock") return mock(mockStrategy);
    const prompt = `Return JSON only matching this schema: summary,audienceInsight,keyMessage,tone,contentAngles,headlineVariants,ctaVariants,socialCopyVariants,visualConcepts. Campaign: ${JSON.stringify({ name: campaign.name, brand: campaign.brand, objective: campaign.objective, audience: campaign.audience, tone: campaign.tone, channels: campaign.channels, keyMessage: campaign.keyMessage, constraints: campaign.constraints })}`;
    try {
      const response = await this.client().chat.completions.create({
        model: geminiModel,
        max_completion_tokens: 1600,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You are a B2B creative strategist. Produce useful, safe, concise structured campaign strategy.",
          },
          { role: "user", content: prompt },
        ],
      });
      const content = response.choices[0]?.message.content;
      if (!content)
        throw new ProviderError(
          "MALFORMED_OUTPUT",
          "The provider returned no structured strategy.",
        );
      return {
        output: strategySchema.parse(JSON.parse(content)),
        provider: "gemini",
        model: geminiModel,
        costUsd: null,
        ...tokens(response.usage),
      };
    } catch (error) {
      if (error instanceof ProviderError) throw error;
      if (
        error instanceof SyntaxError ||
        (error instanceof Error && error.name === "ZodError")
      )
        throw new ProviderError(
          "MALFORMED_OUTPUT",
          "Strategy generation could not be completed.",
        );
      throw providerError(
        error,
        "Strategy generation could not be completed.",
        {
          provider: "gemini",
          operation: "strategy",
          model: geminiModel,
        },
      );
    }
  }
  async asset(
    instruction: string,
    kind: AssetKind,
  ): Promise<ProviderResult<string>> {
    if (process.env.AI_PROVIDER_MODE === "mock")
      return mock(`Mock creative asset: ${instruction}`);
    if (kind === "IMAGE") return this.image(instruction);
    const generated = await this.complete(
      `Write polished ${kind.toLowerCase().replaceAll("_", " ")} for this creative brief. Do not mention this instruction. Brief: ${instruction}`,
    );
    return {
      output: generated.content,
      provider: "gemini",
      model: geminiModel,
      costUsd: null,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
    };
  }
  private async image(prompt: string): Promise<ProviderResult<string>> {
    if (
      !process.env.CLIPDROP_API_KEY ||
      !process.env.CLOUDINARY_CLOUD_NAME ||
      !process.env.CLOUDINARY_API_KEY ||
      !process.env.CLOUDINARY_API_SECRET
    )
      throw new ProviderError(
        "CONFIGURATION",
        "Image generation is not configured.",
      );
    try {
      const body = new FormData();
      body.set("prompt", prompt);
      const image = await axios.post(
        "https://clipdrop-api.co/text-to-image/v1",
        body,
        {
          headers: { "x-api-key": process.env.CLIPDROP_API_KEY },
          responseType: "arraybuffer",
          timeout: 30_000,
        },
      );
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET,
        secure: true,
      });
      const uploaded = await new Promise<{ secure_url: string }>(
        (resolve, reject) => {
          const stream = cloudinary.uploader.upload_stream(
            { folder: "creativeflow" },
            (error, result) =>
              error || !result
                ? reject(error ?? new Error("Upload failed"))
                : resolve(result),
          );
          stream.end(Buffer.from(image.data));
        },
      );
      return {
        output: uploaded.secure_url,
        provider: "clipdrop",
        model: null,
        inputTokens: null,
        outputTokens: null,
        costUsd: null,
      };
    } catch (error) {
      throw providerError(error, "Image generation could not be completed.", {
        provider: "clipdrop",
        operation: "image",
        model: null,
      });
    }
  }
}
