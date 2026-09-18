import { describe, expect, it } from "vitest";
import {
  defaultGeminiModel,
  geminiModel,
  providerError,
} from "../src/providers.js";

describe("Gemini model configuration", () => {
  it("uses the stable Flash-Lite model when GEMINI_MODEL is absent", () => {
    expect(defaultGeminiModel).toBe("gemini-3.5-flash-lite");
    expect(geminiModel).toBe(process.env.GEMINI_MODEL ?? defaultGeminiModel);
  });
});

describe("provider error classification", () => {
  it("classifies Gemini 429 responses without exposing upstream content", () => {
    const error = providerError(
      { status: 429 },
      "Strategy generation could not be completed.",
      {
        provider: "gemini",
        operation: "strategy",
        model: "gemini-3.5-flash-lite",
      },
    );

    expect(error).toMatchObject({
      category: "RATE_LIMITED",
      message:
        "Strategy generation could not be completed. (provider HTTP 429)",
      details: {
        provider: "gemini",
        operation: "strategy",
        model: "gemini-3.5-flash-lite",
        upstreamStatus: 429,
      },
    });
  });

  it("keeps timeout classification independent from HTTP errors", () => {
    const error = providerError(
      { name: "APIConnectionTimeoutError" },
      "AI generation could not be completed.",
      {
        provider: "gemini",
        operation: "copy",
        model: "gemini-3.5-flash-lite",
      },
    );

    expect(error.category).toBe("TIMEOUT");
    expect(error.details.upstreamStatus).toBeUndefined();
  });
});
