/**
 * Security utilities for authentication
 */

import { SignJWT, jwtVerify, type JWTPayload } from 'jose';
import { cookies } from 'next/headers';

const JWT_SECRET = new TextEncoder().encode(
  process.env.AUTH_SECRET || 'your-secret-key-change-in-production'
);

export interface UserPayload {
  userId: string;
  email: string;
  plan: 'basic' | 'standard' | 'pro';
}

/**
 * Create a JWT token for a user
 */
export async function createToken(payload: UserPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

/**
 * Verify and decode a JWT token
 */
export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload as unknown as UserPayload;
  } catch {
    return null;
  }
}

/**
 * Get current user from request cookies (for server components)
 */
export async function getCurrentUser(): Promise<UserPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth_token')?.value;

  if (!token) return null;

  return verifyToken(token);
}

/**
 * Get user ID from Authorization header (for API routes)
 */
export async function getUserFromHeader(
  authHeader: string | null
): Promise<UserPayload | null> {
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.slice(7);
  return verifyToken(token);
}

/**
 * Get user from request - checks Authorization header, cookie, or X-User-Id header (set by middleware)
 * For use in API routes
 */
export async function getUserFromRequest(
  headers: Headers
): Promise<UserPayload | null> {
  // First try Authorization header
  const authHeader = headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const user = await getUserFromHeader(authHeader);
    if (user) return user;
  }

  // Fall back to cookie (from Cookie header)
  const cookieHeader = headers.get('Cookie') || '';
  const authCookie = cookieHeader
    .split(';')
    .find((c) => c.trim().startsWith('auth_token='));
  if (authCookie) {
    const token = authCookie.split('=')[1].trim();
    return verifyToken(token);
  }

  // Finally, check X-User-Id header set by middleware (for cross-request auth)
  const userId = headers.get('X-User-Id');
  const userPlan = headers.get('X-User-Plan') || 'basic';
  if (userId) {
    return { userId, email: '', plan: userPlan as UserPayload['plan'] };
  }

  return null;
}
