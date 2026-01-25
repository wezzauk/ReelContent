/**
 * Next.js middleware entry point
 * Imports security middleware from lib/security/middleware.ts
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { handleRequest, config } from '@/lib/security/middleware';

export function middleware(request: NextRequest) {
  return handleRequest(request);
}

export const config = {
  // Match all routes except static files, images, and favicon
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
