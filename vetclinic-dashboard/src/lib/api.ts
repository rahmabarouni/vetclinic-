const API_BASE = process.env.BACKEND_URL || 'http://localhost:3000';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface PendingChangeRequest {
  id: string;
  proposedStart: string;
  proposedEnd: string;
  proposedType: string;
  proposedReason: string | null;
  status: string;
  createdAt: string;
  requestedById: string;
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
  reminderSentAt?: string | null;
  createdAt: string;
  updatedAt: string;
  pet: { id: string; name: string; species: string; breed: string | null; sex: string; ownerId: string };
  client: { id: string; email: string; firstName: string; lastName: string; role: string };
  veterinarian: {
    id: string; userId: string; specialty: string | null;
    user: { id: string; email: string; firstName: string; lastName: string; role: string };
  } | null;
  medicalRecord: { id: string } | null;
  pendingChangeRequest?: PendingChangeRequest | null;
}

export interface ChangeRequest {
  id: string;
  appointmentId: string;
  requestedById: string;
  proposedStart: string;
  proposedEnd: string;
  proposedType: string;
  proposedReason: string | null;
  status: string;
  responseNote: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  createdAt: string;
  updatedAt: string;
  appointment: {
    id: string;
    scheduledStart: string;
    scheduledEnd: string;
    appointmentType: string;
    status: string;
    pet: { id: string; name: string; species: string };
    client: { id: string; firstName: string; lastName: string; email: string };
    veterinarian: { id: string; user: { firstName: string; lastName: string } } | null;
  };
  requestedBy: { id: string; firstName: string; lastName: string; role: string };
  resolvedBy: { id: string; firstName: string; lastName: string } | null;
}

export interface ClientListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  petsCount: number;
  appointmentsCount: number;
}

export interface PetSummary {
  id: string;
  name: string;
  species: string;
  breed: string | null;
  sex: string;
  birthDate: string | null;
  weightKg: number | null;
  photoUrl: string | null;
  isActive: boolean;
  createdAt: string;
  medicalRecordsCount: number;
  appointmentsCount: number;
  remindersCount: number;
  documentsCount: number;
}

export interface ClientDetail {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  address: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  pets: PetSummary[];
}

export interface Conversation {
  id: string;
  clientId: string;
  veterinarianId: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  client: { id: string; email: string; firstName: string; lastName: string; role: string };
  veterinarian: {
    id: string; userId: string; specialty: string | null;
    user: { id: string; email: string; firstName: string; lastName: string; role: string };
  } | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  content: string | null;
  attachmentUrl: string | null;
  attachmentType: string | null;
  isRead: boolean;
  createdAt: string;
  updatedAt: string;
  sender: { id: string; email: string; firstName: string; lastName: string; role: string };
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

export interface DashboardStats {
  appointmentsToday: { byStatus: Record<string, number>; total: number };
  newClientsLast30Days: number;
  cancellationRate: { total: number; cancelled: number; rate: string };
  appointmentTypesLast30Days: Record<string, number>;
  appointmentsByStatusLast30Days?: Record<string, number>;
  appointmentsPerDay?: { date: string; count: number }[];
  unreadMessages: number;
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
