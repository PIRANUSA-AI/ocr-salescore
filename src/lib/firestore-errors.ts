/**
 * @fileOverview Helper to detect Firestore quota exhaustion (Spark plan daily
 * read/write limits) so read actions can surface a friendly message instead
 * of a raw gRPC error / white-screening the dashboard.
 */

/** gRPC status code 8 = RESOURCE_EXHAUSTED. */
const RESOURCE_EXHAUSTED_GRPC_CODE = 8;

export function isResourceExhausted(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: unknown; message?: unknown };
  if (err.code === RESOURCE_EXHAUSTED_GRPC_CODE || err.code === 'resource-exhausted') {
    return true;
  }
  const message = typeof err.message === 'string' ? err.message : '';
  return /RESOURCE_EXHAUSTED|Quota exceeded/i.test(message);
}

export const QUOTA_EXCEEDED_MESSAGE =
  'Kuota database harian sudah penuh. Data mungkin belum ter-update — coba lagi beberapa saat, atau hubungi admin untuk upgrade paket Firebase.';
