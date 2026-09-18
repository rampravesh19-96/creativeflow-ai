import { describe, expect, it, vi, afterEach } from "vitest";
import {
  api,
  ApiError,
  AuthenticationError,
  MissingAuthenticationTokenError,
} from "./api";
describe("API client", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("returns typed campaign responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data: [] }) }),
    );
    await expect(api.campaigns("session-token")).resolves.toEqual([]);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/campaigns",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
  });
  it("loads persisted generation history through authenticated API client", async () => {
    const history = [
      { id: "run-1", operation: "strategy", status: "SUCCEEDED" },
    ];
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ data: history }) }),
    );
    await expect(api.history("session-token")).resolves.toEqual(history);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/generation-runs",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
  });
  it("loads usage summaries through authenticated API client", async () => {
    const usage = {
      totalRuns: 1,
      successfulRuns: 1,
      failedRuns: 0,
      textGenerations: 1,
      imageGenerations: 0,
      averageLatencyMs: 40,
      tokens: 0,
      costUsd: null,
      recent: [],
    };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ data: usage }) }),
    );
    await expect(api.usage("session-token")).resolves.toEqual(usage);
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/usage",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
  });
  it("regenerates an asset through authenticated API client", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { asset: { id: "asset-1" }, version: { sequence: 2 } },
        }),
      }),
    );
    await expect(
      api.regenerate("asset-1", "Refresh the copy", "session-token"),
    ).resolves.toEqual({ asset: { id: "asset-1" }, version: { sequence: 2 } });
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/assets/asset-1/regenerate",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ instruction: "Refresh the copy" }),
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
  });
  it("loads persisted asset versions through authenticated API client", async () => {
    const versions = [
      { id: "version-1", sequence: 1, content: "Generated copy" },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ data: versions }),
      }),
    );
    await expect(api.versions("asset-1", "session-token")).resolves.toEqual(
      versions,
    );
    expect(fetch).toHaveBeenCalledWith(
      "http://localhost:3000/api/v1/assets/asset-1/versions",
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer session-token",
        }),
      }),
    );
  });
  it("maps API failures to errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 422,
        json: async () => ({ message: "Campaign input is invalid." }),
      }),
    );
    await expect(api.campaigns("session-token")).rejects.toBeInstanceOf(
      ApiError,
    );
  });
  it("recognizes a 401 as authentication loss", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          code: "UNAUTHENTICATED",
          message: "Authentication is required.",
        }),
      }),
    );
    await expect(api.campaigns("session-token")).rejects.toBeInstanceOf(
      AuthenticationError,
    );
  });
  it("keeps a 403 as a normal authorization error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ message: "Forbidden." }),
      }),
    );
    await expect(api.campaigns("session-token")).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(api.campaigns("session-token")).rejects.not.toBeInstanceOf(
      AuthenticationError,
    );
  });
  it("does not send a protected request without a token", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(api.campaigns()).rejects.toBeInstanceOf(
      MissingAuthenticationTokenError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
