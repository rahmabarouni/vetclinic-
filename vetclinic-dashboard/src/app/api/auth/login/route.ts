import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_BASE = process.env.BACKEND_URL || 'http://localhost:3000';

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, password } = body;

  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    return NextResponse.json({ error: err.error || 'Identifiants invalides' }, { status: res.status });
  }

  const data = await res.json();
  const allowedRoles = ['VETERINARIAN', 'ADMIN', 'STAFF'];
  if (!allowedRoles.includes(data.user.role)) {
    return NextResponse.json({ error: 'Accès réservé aux vétérinaires, administrateurs et staff' }, { status: 403 });
  }

  const response = NextResponse.json({ user: data.user });
  response.cookies.set('dashboard_token', data.token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24, // 24 hours
  });

  return response;
}
