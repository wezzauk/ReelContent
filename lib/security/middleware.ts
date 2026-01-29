/**
 * Security middleware for headers, CORS, and request handling
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getUserFromHeader, verifyToken } from './auth';
import { sanitizeError, errorResponse, ERROR_CODES } from './errors';

/**
 * Get user from request - checks both cookie and Authorization header
 */
async function getUserFromRequest(
  request: NextRequest
): Promise<{ userId: string; email: string; plan: string } | null> {
  // First try Authorization header
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const user = await getUserFromHeader(authHeader);
    if (user) return user;
  }

  // Fall back to cookie
  const cookieToken = request.cookies.get('auth_token')?.value;
  if (cookieToken) {
    return verifyToken(cookieToken);
  }

  return null;
}

/**
 * Allowed origins for CORS (configure per environment)
 */
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS?.split(',') || [
  'http://localhost:3000',
];

/**
 * Secure headers to apply to all responses
 */
const SECURE_HEADERS = {
  'X-DNS-Prefetch-Control': 'on',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/**
 * Check if origin is allowed for CORS
 */
function isOriginAllowed(origin: string): boolean {
  return ALLOWED_ORIGINS.includes('*') || ALLOWED_ORIGINS.includes(origin);
}

/**
 * Create CORS headers for a request
 */
function getCorsHeaders(request: NextRequest): Record<string, string> {
  const origin = request.headers.get('origin');

  if (!origin || !isOriginAllowed(origin)) {
    return {};
  }

  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Idempotency-Key',
    'Access-Control-Expose-Headers': 'X-Request-Id',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Apply security headers to a response
 */
function applySecurityHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(SECURE_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}

/**
 * Main security middleware handler
 */
export async function securityMiddleware(request: NextRequest): Promise<NextResponse> {
  // Handle CORS preflight
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    const corsHeaders = getCorsHeaders(request);
    for (const [key, value] of Object.entries(corsHeaders)) {
      response.headers.set(key, value);
    }
    return applySecurityHeaders(response);
  }

  // Create base response
  const response = NextResponse.next();

  // Apply CORS headers
  const corsHeaders = getCorsHeaders(request);
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }

  // Apply security headers
  applySecurityHeaders(response);

  return response;
}

/**
 * Auth guard middleware - protects authenticated routes
 * All /api/* routes require authentication except public endpoints
 */
export async function authGuard(
  request: NextRequest
): Promise<NextResponse | null> {
  // Skip auth for truly public routes
  const publicPaths = [
    '/health',
    '/api/health',
    '/api/webhooks',
    '/api/auth/signup',
    '/api/auth/signin',
    '/api/worker', // Worker endpoints (authenticated via QStash signature)
  ];
  if (publicPaths.some((path) => request.nextUrl.pathname.startsWith(path))) {
    return null;
  }

  // All API routes require authentication
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const user = await getUserFromRequest(request);

    if (!user) {
      const response = NextResponse.json(
        errorResponse(ERROR_CODES.UNAUTHORIZED, 'Authentication required'),
        { status: 401 }
      );
      return applySecurityHeaders(response);
    }

    // Attach user to request headers for downstream use
    request.headers.set('X-User-Id', user.userId);
    request.headers.set('X-User-Plan', user.plan);

    return NextResponse.next();
  }

  // Dashboard routes also require authentication
  const protectedPaths = ['/dashboard', '/create', '/review', '/library'];
  if (protectedPaths.some((path) => request.nextUrl.pathname.startsWith(path))) {
    const user = await getUserFromRequest(request);

    if (!user) {
      const response = NextResponse.redirect(new URL('/login', request.url));
      return applySecurityHeaders(response);
    }

    // Attach user to request headers for downstream use
    request.headers.set('X-User-Id', user.userId);
    request.headers.set('X-User-Plan', user.plan);

    return NextResponse.next();
  }

  return null;
}

/**
 * Combined middleware for security and auth
 */
export async function handleRequest(request: NextRequest): Promise<NextResponse> {
  try {
    // Apply security headers and CORS first
    const securityResponse = await securityMiddleware(request);

    // If it's a preflight request, return early
    if (request.method === 'OPTIONS') {
      return securityResponse;
    }

    // Check auth for all API routes (both read and write)
    if (request.nextUrl.pathname.startsWith('/api/')) {
      const authResponse = await authGuard(request);
      if (authResponse) {
        return authResponse;
      }
    }

    return securityResponse;
  } catch (error) {
    // Handle unexpected errors
    const response = NextResponse.json(sanitizeError(error), {
      status: error instanceof Error && 'status' in error ? (error as { status: number }).status : 500,
    });
    return applySecurityHeaders(response);
  }
}

/**
 * Next.js middleware configuration
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
