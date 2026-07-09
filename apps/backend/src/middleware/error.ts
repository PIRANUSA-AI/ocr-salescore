import { Context } from 'hono';

export async function errorHandler(err: Error, c: Context): Promise<Response> {
  console.error('[error]', err.message);
  c.status(500);
  return c.json({
    error: 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { detail: err.message }),
  });
}
