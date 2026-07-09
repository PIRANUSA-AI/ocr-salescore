export type SecurityRuleContext = {
  path: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete' | 'write';
  requestResourceData?: any;
};

export class FirestorePermissionError extends Error {
  context: SecurityRuleContext;
  baseError?: Error;

  constructor(context: SecurityRuleContext, baseError?: Error) {
    const formattedContext = JSON.stringify(
      {
        auth: 'See Next.js server console for user auth object',
        ...context,
      },
      null,
      2
    );

    const message = `FirestoreError: Missing or insufficient permissions: The following request was denied by Firestore Security Rules:\n${formattedContext}`;
    super(message);
    this.name = 'FirestorePermissionError';
    this.context = context;
    this.baseError = baseError;

    // This is to make the stack trace more useful.
    if (baseError?.stack) {
      this.stack = baseError.stack;
    } else if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FirestorePermissionError);
    }
  }
}
