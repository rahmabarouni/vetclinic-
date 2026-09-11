import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_BASE = process.env.BACKEND_URL || 'http://localhost:3000';

export async function GET(request: NextRequest) {
  const token = request.cookies.get('dashboard_token')?.value;
  if (!token) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 });
  }

  const res = await fetch(`${API_BASE}/api/v1/users/profile`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    return NextResponse.json({ error: 'Token invalide' }, { status: 401 });
  }

  const data = await res.json();
  return NextResponse.json({ user: data.user });
}
