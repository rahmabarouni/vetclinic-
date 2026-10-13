'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Appointment, PaginatedResponse } from '@/lib/api';

const STATUS_OPTIONS = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  COMPLETED: 'bg-blue-100 text-blue-800',
  CANCELLED: 'bg-red-100 text-red-800',
  NO_SHOW: 'bg-gray-100 text-gray-800',
};

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmé',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
  NO_SHOW: 'Absent',
};

const TYPE_LABELS: Record<string, string> = {
  CONSULTATION: 'Consultation',
  VACCINATION: 'Vaccination',
  SURGERY: 'Chirurgie',
  EMERGENCY: 'Urgence',
  CHECKUP: 'Contrôle',
  GROOMING: 'Toilettage',
  OTHER: 'Autre',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function AppointmentsPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch('/api/proxy/appointments?page=1&limit=50')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Erreur ${res.status}`))))
      .then((data: PaginatedResponse<Appointment>) => {
        setAppointments(data.data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [user]);

  const handleStatusChange = async (appointmentId: string, newStatus: string) => {
    setUpdatingId(appointmentId);
    try {
      const res = await fetch(`/api/proxy/appointments/${appointmentId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      const data = await res.json();
      setAppointments((prev) =>
        prev.map((a) => (a.id === appointmentId ? data.appointment : a))
      );
    } catch (err: any) {
      setError(err.message);
    } finally {
      setUpdatingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Chargement...</div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">VetClinic Dashboard</h1>
            <p className="text-sm text-gray-500">
              {user.firstName} {user.lastName} — {user.role}
            </p>
          </div>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/dashboard" className="text-gray-600 hover:text-green-600">
              Statistiques
            </Link>
            <Link href="/dashboard/appointments" className="text-green-600 font-medium">
              Rendez-vous
            </Link>
            <button
              onClick={() => { logout(); router.push('/login'); }}
              className="text-gray-500 hover:text-red-600"
            >
              Déconnexion
            </button>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Mes rendez-vous ({appointments.length})
        </h2>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md text-sm mb-4">{error}</div>
        )}

        {appointments.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Aucun rendez-vous</div>
        ) : (
          <div className="space-y-3">
            {appointments.map((apt) => {
              const recordBase = `/dashboard/pets/${apt.petId}/medical-records?appointmentId=${apt.id}&petName=${encodeURIComponent(apt.pet.name)}${apt.veterinarianId ? `&veterinarianId=${apt.veterinarianId}` : ''}${apt.veterinarian ? `&vetName=${encodeURIComponent(`Dr ${apt.veterinarian.user.firstName} ${apt.veterinarian.user.lastName}`)}` : ''}`;
              return (
              <div key={apt.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-gray-900">
                        {TYPE_LABELS[apt.appointmentType] || apt.appointmentType}
                      </span>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[apt.status] || 'bg-gray-100'}`}>
                        {STATUS_LABELS[apt.status] || apt.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">
                      {apt.pet.name} ({apt.pet.species})
                    </div>
                    <div className="text-sm text-gray-500">
                      Client: {apt.client.firstName} {apt.client.lastName}
                    </div>
                    <div className="text-sm text-gray-500">
                      {formatDate(apt.scheduledStart)} — {formatDate(apt.scheduledEnd)}
                    </div>
                    {apt.reason && (
                      <div className="text-sm text-gray-400 mt-1">Motif: {apt.reason}</div>
                    )}
                    <div className="flex flex-wrap gap-3 mt-2">
                      <Link
                        href={recordBase}
                        className="text-sm text-green-600 hover:underline"
                      >
                        Voir le dossier médical
                      </Link>
                      <Link
                        href={`${recordBase}&new=1`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        Ajouter une note de consultation
                      </Link>
                    </div>
                  </div>

                  <div className="flex-shrink-0">
                    <select
                      value={apt.status}
                      onChange={(e) => handleStatusChange(apt.id, e.target.value)}
                      disabled={updatingId === apt.id}
                      className="text-sm border border-gray-300 rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
