/**
 * Structured logging utilities using Pino
 */

import pino, { type Logger } from 'pino';
import { config } from '../utils/config.js';

/**
 * Create the base logger instance
 */
const baseLogger = pino({
  level: config.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: config.NODE_ENV !== 'production' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  } : undefined,
  base: {
    env: config.NODE_ENV,
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'body.password',
      'body.token',
      'body.prompt', // Redact prompts by default
      '*.password',
      '*.token',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Create a child logger with common context
 */
export function createLogger(context: Record<string, unknown> = {}): Logger {
  return baseLogger.child(context);
}

/**
 * Get the base logger instance
 */
export function getLogger(): Logger {
  return baseLogger;
}

/**
 * Logger instance for use across the application
 */
export const logger = getLogger();
