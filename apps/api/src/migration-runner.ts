import type { PoolClient } from "pg";

const advisoryLockId = 85433721;
const maxAttempts = 3;
const retryDelaysMs = [1_000, 2_000] as const;

export type MigrationRunnerOptions = {
  connect: () => Promise<PoolClient>;
  migrationFiles: () => Promise<string[]>;
  readMigration: (filename: string) => Promise<string>;
  close: () => Promise<void>;
  sleep?: (delayMs: number) => Promise<void>;
  log?: (message: string) => void;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown database error";
}

function isTransientConnectionError(error: unknown) {
  if (!(error instanceof Error)) return false;

  const code = (error as NodeJS.ErrnoException).code;
  if (
    code?.startsWith("08") ||
    ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT"].includes(code ?? "")
  ) {
    return true;
  }

  return /connection terminated unexpectedly|connection ended unexpectedly|connection.*(closed|reset)|terminating connection|server closed the connection/i.test(
    error.message,
  );
}

async function runMigrationAttempt({
  connect,
  migrationFiles,
  readMigration,
  log = console.error,
}: Omit<MigrationRunnerOptions, "close" | "sleep">) {
  const client = await connect();
  let clientError: Error | undefined;
  let rejectClientError: ((error: Error) => void) | undefined;
  const clientErrorPromise = new Promise<never>((_, reject) => {
    rejectClientError = reject;
  });
  void clientErrorPromise.catch(() => undefined);
  const onClientError = (error: Error) => {
    clientError = error;
    log(`Migration database client error: ${errorMessage(error)}`);
    rejectClientError?.(error);
  };
  let lockAcquired = false;
  let transactionOpen = false;

  client.on("error", onClientError);

  const query = async (text: string, values?: unknown[]) => {
    if (clientError) throw clientError;
    return Promise.race([client.query(text, values), clientErrorPromise]);
  };

  try {
    await query("SELECT pg_advisory_lock($1)", [advisoryLockId]);
    lockAcquired = true;
    await query(`
      CREATE TABLE IF NOT EXISTS creativeflow_schema_migrations (
        filename text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await migrationFiles())
      .filter((filename) => /^\d+_.+\.sql$/i.test(filename))
      .sort();

    for (const filename of files) {
      const applied = await query(
        "SELECT 1 FROM creativeflow_schema_migrations WHERE filename = $1",
        [filename],
      );
      if (applied.rowCount) continue;

      try {
        await query("BEGIN");
        transactionOpen = true;
        await query(await readMigration(filename));
        await query(
          "INSERT INTO creativeflow_schema_migrations (filename) VALUES ($1)",
          [filename],
        );
        await query("COMMIT");
        transactionOpen = false;
        console.log(`Applied migration ${filename}`);
      } catch (error) {
        if (transactionOpen && !clientError) {
          try {
            await client.query("ROLLBACK");
          } catch (rollbackError) {
            log(`Migration rollback failed: ${errorMessage(rollbackError)}`);
          }
        }
        transactionOpen = false;
        throw error;
      }
    }
    if (clientError) throw clientError;
  } finally {
    if (lockAcquired && !clientError) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [advisoryLockId]);
      } catch (unlockError) {
        log(`Migration advisory unlock failed: ${errorMessage(unlockError)}`);
      }
    }
    client.off("error", onClientError);
    client.release(clientError);
  }
}

export async function runMigrationsWithRetry({
  connect,
  migrationFiles,
  readMigration,
  close,
  sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
  log,
}: MigrationRunnerOptions) {
  let lastError: unknown;
  try {
    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      try {
        await runMigrationAttempt({
          connect,
          migrationFiles,
          readMigration,
          log,
        });
        return;
      } catch (error) {
        lastError = error;
        if (!isTransientConnectionError(error) || attempt === maxAttempts - 1) {
          throw error;
        }
        const delayMs = retryDelaysMs[attempt];
        (log ?? console.error)(
          `Migration connection failed; retrying in ${delayMs}ms (attempt ${attempt + 2}/${maxAttempts}).`,
        );
        await sleep(delayMs);
      }
    }
  } finally {
    await close();
  }

  throw lastError;
}

export const migrationRetryPolicy = {
  attempts: maxAttempts,
  delaysMs: retryDelaysMs,
};
