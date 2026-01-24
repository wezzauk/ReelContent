/**
 * Request ID middleware and utilities
 */

import { randomUUID } from 'node:crypto';

/**
 * Request ID header name
 */
export const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * Generate a new request ID
 */
export function generateRequestId(): string {
  return randomUUID();
}

/**
 * Get request ID from headers or generate new one
 */
export function getRequestId(): string {
  // This will be set by the request context in actual API routes
  // For now, return a generated ID
  return generateRequestId();
}

/**
 * Set request ID context (for async operations)
 */
const requestIdContext = new Map<string, string>();

/**
 * Set the request ID for the current context
 */
export function setRequestId(requestId: string): void {
  requestIdContext.set('current', requestId);
}

/**
 * Get the request ID from current context
 */
export function getContextRequestId(): string | undefined {
  return requestIdContext.get('current');
}

/**
 * Clear the request ID from context
 */
export function clearRequestId(): void {
  requestIdContext.delete('current');
}
