import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { users, subscriptions } from '@/lib/db/schema';
import { hash } from 'bcryptjs';
import { createToken } from '@/lib/security/auth';

export async function POST(req: Request) {
  try {
    const { email, password, name } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if user already exists
    const existingUser = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.email, email.toLowerCase()),
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const hashedPassword = await hash(password, 12);

    // Create user
    const [newUser] = await db.insert(users).values({
      email: email.toLowerCase(),
      name: name || email.split('@')[0],
      hashedPassword,
    }).returning();

    // Create default subscription (basic plan)
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await db.insert(subscriptions).values({
      userId: newUser.id,
      plan: 'basic',
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });

    // Create JWT token
    const token = await createToken({
      userId: newUser.id,
      email: newUser.email!,
      plan: 'basic',
    });

    const response = NextResponse.json({
      user: {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name,
      },
      token,
    });

    // Set auth cookie
    response.cookies.set('auth_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Signup error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
