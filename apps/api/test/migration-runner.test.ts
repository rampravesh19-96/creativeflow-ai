import type { PoolClient } from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runMigrationsWithRetry } from "../src/migration-runner.js";

type QueryResult = { rowCount: number | null };

function createClient(
  queryHandler: (text: string, values?: unknown[]) => Promise<QueryResult>,
) {
  let errorHandler: ((error: Error) => void) | undefined;
  const release = vi.fn();
  return {
    client: {
      query: queryHandler,
      on: vi.fn((event: string, handler: (error: Error) => void) => {
        if (event === "error") errorHandler = handler;
      }),
      off: vi.fn(),
      release,
    } as unknown as PoolClient,
    emitError: (error: Error) => errorHandler?.(error),
    release,
  };
}

const noDelay = async () => undefined;

afterEach(() => {
  vi.restoreAllMocks();
});

describe("migration runner", () => {
  it("skips an already-applied migration", async () => {
    const queries: string[] = [];
    const fake = createClient(async (text) => {
      queries.push(text);
      return { rowCount: text.includes("WHERE filename") ? 1 : 0 };
    });
    const readMigration = vi.fn();

    await runMigrationsWithRetry({
      connect: async () => fake.client,
      migrationFiles: async () => ["001_creativeflow.sql"],
      readMigration,
      close: async () => undefined,
      sleep: noDelay,
    });

    expect(readMigration).not.toHaveBeenCalled();
    expect(queries.some((query) => query.includes("BEGIN"))).toBe(false);
    expect(fake.release).toHaveBeenCalledOnce();
  });

  it("records a successful migration only after its SQL succeeds", async () => {
    const queries: string[] = [];
    const fake = createClient(async (text) => {
      queries.push(text);
      return { rowCount: 0 };
    });
    vi.spyOn(console, "log").mockImplementation(() => undefined);

    await runMigrationsWithRetry({
      connect: async () => fake.client,
      migrationFiles: async () => ["001_creativeflow.sql"],
      readMigration: async () => "CREATE TABLE example (id integer)",
      close: async () => undefined,
      sleep: noDelay,
    });

    expect(queries).toContain("CREATE TABLE example (id integer)");
    expect(
      queries.findIndex((query) =>
        query.includes("INSERT INTO creativeflow_schema_migrations"),
      ),
    ).toBeGreaterThan(queries.indexOf("CREATE TABLE example (id integer)"));
    expect(queries).toContain("COMMIT");
  });

  it("rolls back and does not record a failed migration", async () => {
    const queries: string[] = [];
    const fake = createClient(async (text) => {
      queries.push(text);
      if (text === "BROKEN SQL") throw new Error("syntax error");
      return { rowCount: 0 };
    });

    await expect(
      runMigrationsWithRetry({
        connect: async () => fake.client,
        migrationFiles: async () => ["001_creativeflow.sql"],
        readMigration: async () => "BROKEN SQL",
        close: async () => undefined,
        sleep: noDelay,
      }),
    ).rejects.toThrow("syntax error");

    expect(queries).toContain("ROLLBACK");
    expect(
      queries.some((query) =>
        query.includes("INSERT INTO creativeflow_schema_migrations"),
      ),
    ).toBe(false);
  });

  it("retries a transient connection failure with a fresh client", async () => {
    const first = createClient(async () => ({ rowCount: 0 }));
    const second = createClient(async (text) => ({
      rowCount: text.includes("WHERE filename") ? 1 : 0,
    }));
    const connect = vi
      .fn<() => Promise<PoolClient>>()
      .mockRejectedValueOnce(
        Object.assign(new Error("Connection terminated unexpectedly"), {
          code: "ECONNRESET",
        }),
      )
      .mockResolvedValueOnce(second.client);
    const delays: number[] = [];

    await runMigrationsWithRetry({
      connect,
      migrationFiles: async () => ["001_creativeflow.sql"],
      readMigration: async () => "unused",
      close: async () => undefined,
      sleep: async (delayMs) => {
        delays.push(delayMs);
      },
    });

    expect(connect).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([1_000]);
    expect(first.release).not.toHaveBeenCalled();
    expect(second.release).toHaveBeenCalledOnce();
  });

  it("bounds transient retries at three attempts", async () => {
    const connect = vi.fn<() => Promise<PoolClient>>().mockRejectedValue(
      Object.assign(new Error("Connection terminated unexpectedly"), {
        code: "ECONNRESET",
      }),
    );
    const delays: number[] = [];

    await expect(
      runMigrationsWithRetry({
        connect,
        migrationFiles: async () => [],
        readMigration: async () => "unused",
        close: async () => undefined,
        sleep: async (delayMs) => {
          delays.push(delayMs);
        },
      }),
    ).rejects.toThrow("Connection terminated unexpectedly");

    expect(connect).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([1_000, 2_000]);
  });

  it("handles a pg client error event without an unhandled crash", async () => {
    const fake = createClient(async () => {
      fake.emitError(new Error("Connection terminated unexpectedly"));
      return new Promise<QueryResult>(() => undefined);
    });

    await expect(
      runMigrationsWithRetry({
        connect: async () => fake.client,
        migrationFiles: async () => [],
        readMigration: async () => "unused",
        close: async () => undefined,
        sleep: noDelay,
        log: () => undefined,
      }),
    ).rejects.toThrow("Connection terminated unexpectedly");

    expect(fake.release).toHaveBeenCalledTimes(3);
  });
});
