// src/lib/mysql.ts
// Real MySQL data layer (no mocks). Connection pool singleton — reused across
// server-action invocations so concurrent users share pooled connections
// instead of opening a socket each request (prevents "antri"/queueing).
import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';

let pool: Pool | undefined;

export function getPool(): Pool {
  if (pool) return pool;

  pool = mysql.createPool({
    host: process.env.MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.MYSQL_PORT || 3307),
    user: process.env.MYSQL_USER || 'salescore',
    password: process.env.MYSQL_PASSWORD || 'salescore_pass',
    database: process.env.MYSQL_DATABASE || 'salescore',
    // Pool sizing tuned for many concurrent sales users at the exhibition.
    waitForConnections: true,
    connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 15),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    dateStrings: true, // return DATE/DATETIME as strings (stable JSON serialization)
  });

  return pool;
}

/**
 * Parameterized query helper. ALWAYS pass user values via `params` — never
 * string-interpolate into `sql` (prevents SQL injection).
 */
export async function query<T extends RowDataPacket[] | ResultSetHeader>(
  sql: string,
  params: any[] = []
): Promise<T> {
  const [rows] = await getPool().execute<T>(sql, params);
  return rows;
}
