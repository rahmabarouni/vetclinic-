const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface Appointment {
  id: string;
  petId: string;
  clientId: string;
  veterinarianId: string | null;
  appointmentType: string;
  status: string;
  scheduledStart: string;
  scheduledEnd: string;
  reason: string | null;
  cancellationReason: string | null;
  createdAt: string;
  updatedAt: string;
  pet: { id: string; name: string; species: string; breed: string | null; sex: string; ownerId: string };
  client: { id: string; email: string; firstName: string; lastName: string; role: string };
  veterinarian: {
    id: string; userId: string; specialty: string | null;
    user: { id: string; email: string; firstName: string; lastName: string; role: string };
  } | null;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: { page: number; limit: number; total: number; totalPages: number };
}

export async function apiLogin(email: string, password: string): Promise<{ token: string; user: User }> {
  const res = await fetch(`${API_BASE}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Login failed (${res.status})`);
  }
  return res.json();
}

export async function apiGetAppointments(token: string): Promise<PaginatedResponse<Appointment>> {
  const res = await fetch(`${API_BASE}/api/v1/appointments?page=1&limit=50`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to load appointments (${res.status})`);
  return res.json();
}

export async function apiUpdateStatus(
  token: string,
  appointmentId: string,
  status: string
): Promise<{ appointment: Appointment }> {
  const res = await fetch(`${API_BASE}/api/v1/appointments/${appointmentId}/status`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Status update failed (${res.status})`);
  }
  return res.json();
}
