import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

export type Queryable = {
  query: (text: string, params?: unknown[]) => Promise<{ rows: any[]; rowCount: number | null }>;
};

let pool: any = null;

function createPool() {
  if (process.env.DB_DRIVER === "pg") {
    // eslint-disable-next-line no-eval
    const { Pool } = eval("require")("pg");
    return new Pool({ connectionString: process.env.DATABASE_URL, max: 10 });
  }
  neonConfig.webSocketConstructor = ws;
  return new NeonPool({ connectionString: process.env.DATABASE_URL, max: 5 });
}

export function getPool(): any {
  if (!pool) pool = createPool();
  return pool;
}

export async function q<T = any>(text: string, params: unknown[] = [], c?: Queryable): Promise<T[]> {
  const r = await (c ?? getPool()).query(text, params);
  return r.rows as T[];
}

export async function one<T = any>(text: string, params: unknown[] = [], c?: Queryable): Promise<T | null> {
  const rows = await q<T>(text, params, c);
  return rows[0] ?? null;
}

/** Ejecuta `fn` dentro de una transacción. Hace ROLLBACK ante cualquier error. */
export async function tx<T>(fn: (c: Queryable) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function closePool() {
  if (pool) await pool.end();
  pool = null;
}
