/**
 * DEV ONLY: Grant Pro Boost to a user
 *
 * This endpoint is for development/testing purposes only.
 * It should only be enabled in development environments.
 *
 * POST /api/dev/admin/boost
 * Body: { userEmail: string, days?: number }
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { config } from '../../../../../lib/utils/config';
import { boostRepo, userRepo } from '../../../../../lib/db/repositories';
import { logger } from '../../../../../lib/observability/logger';

const grantBoostSchema = z.object({
  userEmail: z.string().email(),
  days: z.number().int().positive().default(30),
});

export async function POST(request: NextRequest): Promise<Response> {
  // Block in production
  if (config.NODE_ENV === 'production') {
    return NextResponse.json(
      { error: 'This endpoint is not available in production' },
      { status: 403 }
    );
  }

  const log = logger.child({ route: '/api/dev/admin/boost' });

  try {
    const body = await request.json();
    const { userEmail, days } = grantBoostSchema.parse(body);

    log.info({ userEmail, days }, 'Granting Pro Boost');

    // Find user by email
    const user = await userRepo.findByEmail(userEmail);
    if (!user) {
      return NextResponse.json(
        { error: 'User not found', email: userEmail },
        { status: 404 }
      );
    }

    // Calculate expiry date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    // Create the boost
    const boost = await boostRepo.create({
      userId: user.id,
      stripePurchaseId: `dev-grant-${Date.now()}`,
      amount: '19.95',
      expiresAt,
      isActive: true,
    });

    log.info({ userId: user.id, boostId: boost.id, expiresAt }, 'Pro Boost granted');

    return NextResponse.json({
      success: true,
      data: {
        boostId: boost.id,
        userId: user.id,
        email: userEmail,
        expiresAt: expiresAt.toISOString(),
        days,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid request', details: error.errors },
        { status: 400 }
      );
    }

    log.error({ error }, 'Failed to grant Pro Boost');
    return NextResponse.json(
      { error: 'Failed to grant Pro Boost' },
      { status: 500 }
    );
  }
}
