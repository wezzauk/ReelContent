/**
 * Log redaction utilities for sensitive data
 */

import pino, { type LogDescriptor } from 'pino';

/**
 * Fields that should be redacted from logs
 */
const SENSITIVE_FIELDS = [
  'token',
  'access_token',
  'refresh_token',
  'api_key',
  'apikey',
  'secret',
  'password',
  'pwd',
  'authorization',
  'auth_token',
  'jwt',
  'session',
  'cookie',
];

/**
 * Paths within nested objects to redact
 */
const SENSITIVE_PATHS = [
  'user.password',
  'user.email',
  'user.accessToken',
  'headers.authorization',
  'headers.cookie',
  'body.password',
  'body.prompt',
  'body.content',
  'prompt',
  'input.content',
  'input.prompt',
];

/**
 * Redact a value if it matches sensitive field names
 */
function isSensitiveField(key: string): boolean {
  const lowerKey = key.toLowerCase();
  return SENSITIVE_FIELDS.some((field) => lowerKey.includes(field));
}

/**
 * Recursively redact sensitive values from an object
 */
export function redactSensitiveData(obj: unknown): unknown {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    // Check if the string itself looks like a token or secret
    if (
      obj.startsWith('sk-') ||
      obj.startsWith('eyJ') ||
      /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/.test(obj)
    ) {
      return '[REDACTED]';
    }
    return obj;
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(redactSensitiveData);
  }

  if (typeof obj === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (isSensitiveField(key)) {
        result[key] = '[REDACTED]';
      } else {
        result[key] = redactSensitiveData(value);
      }
    }

    return result;
  }

  return obj;
}

/**
 * Create a redacted pino logger instance
 */
export function createRedactedLogger(opts?: pino.LoggerOptions): pino.Logger {
  return pino({
    ...opts,
    serializers: {
      ...opts?.serializers,
      req: (req: LogDescriptor) => {
        const redacted = { ...req };
        // Redact authorization header
        if (redacted.headers?.authorization) {
          redacted.headers = {
            ...redacted.headers,
            authorization: '[REDACTED]',
          };
        }
        // Redact cookie header
        if (redacted.headers?.cookie) {
          redacted.headers = {
            ...redacted.headers,
            cookie: '[REDACTED]',
          };
        }
        return redacted;
      },
      res: (res: LogDescriptor) => res,
      error: (err: LogDescriptor) => {
        // Don't leak stack traces in production
        if (process.env.NODE_ENV === 'production') {
          return {
            ...err,
            stack: undefined,
          };
        }
        return err;
      },
    },
  });
}

/**
 * Redact specific fields from a log object before serialization
 */
export function redactForLog(obj: Record<string, unknown>): Record<string, unknown> {
  return redactSensitiveData(obj) as Record<string, unknown>;
}

/**
 * Redact prompt content from logs
 */
export function redactPrompt(prompt: string): string {
  // Truncate long prompts to first 100 chars
  if (prompt.length > 100) {
    return prompt.slice(0, 100) + '...[REDACTED]';
  }
  return '[REDACTED]';
}

/**
 * Redact user content from logs (assets, variants, etc.)
 */
export function redactUserContent(content: unknown): unknown {
  // Just mark as present to avoid logging actual content
  if (typeof content === 'string' && content.length > 0) {
    return '[USER_CONTENT_PRESENT]';
  }
  return content;
}
