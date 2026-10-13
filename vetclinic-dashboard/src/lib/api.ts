const API_BASE = process.env.BACKEND_URL || 'http://localhost:3000';

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

export interface MedicalRecord {
  id: string;
  petId: string;
  appointmentId: string | null;
  veterinarianId: string;
  recordType: string;
  title: string;
  description: string | null;
  diagnosis: string | null;
  createdAt: string;
  updatedAt: string;
  veterinarian: {
    id: string;
    userId: string;
    specialty: string | null;
    user: { id: string; email: string; firstName: string; lastName: string; role: string };
  } | null;
}

export interface Reminder {
  id: string;
  petId: string;
  medicalRecordId: string | null;
  reminderType: string;
  title: string;
  dueDate: string;
  notifiedAt: string | null;
  isCompleted: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface VeterinarianListItem {
  id: string;
  userId: string;
  specialty: string | null;
  user: { id: string; email: string; firstName: string; lastName: string; role: string };
}

export async function backendLogin(email: string, password: string): Promise<{ token: string; user: User }> {
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

export async function backendFetch(token: string, path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Request failed (${res.status})`);
  }
  return res.json();
}
