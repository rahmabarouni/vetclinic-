'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { DashboardStats } from '@/lib/api';

const STATUS_ORDER = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;

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

const BAR_COLOR = 'bg-green-500';

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="text-sm text-gray-500">{label}</div>
      <div className="text-3xl font-bold text-gray-900 mt-1">{value}</div>
      {hint && <div className="text-xs text-gray-400 mt-1">{hint}</div>}
    </div>
  );
}

export default function DashboardStatsPage() {
  const { user, loading: authLoading, logout } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetch('/api/proxy/dashboard/stats')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Erreur ${res.status}`))))
      .then((data) => {
        setStats(data.stats);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [user]);

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-gray-500">Chargement...</div>
      </div>
    );
  }

  if (!user) return null;

  const byStatus = stats?.appointmentsToday.byStatus ?? {};
  const types = stats?.appointmentTypesLast30Days ?? {};
  const typeEntries = Object.entries(types).sort((a, b) => b[1] - a[1]);
  const maxType = typeEntries.reduce((m, [, c]) => Math.max(m, c), 0);

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
            <Link href="/dashboard" className="text-green-600 font-medium">
              Statistiques
            </Link>
            <Link href="/dashboard/appointments" className="text-gray-600 hover:text-green-600">
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

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <h2 className="text-lg font-semibold text-gray-900">Statistiques</h2>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
        )}

        {!stats ? (
          <div className="text-center py-12 text-gray-400">Aucune donnée</div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="Rendez-vous aujourd'hui"
                value={stats.appointmentsToday.total}
              />
              <StatCard
                label="Nouveaux clients (30 j)"
                value={stats.newClientsLast30Days}
              />
              <StatCard
                label="Taux d'annulation (30 j)"
                value={stats.cancellationRate.rate}
                hint={`${stats.cancellationRate.cancelled} / ${stats.cancellationRate.total} RDV`}
              />
              <StatCard
                label="Messages non lus"
                value={stats.unreadMessages}
              />
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">
                Rendez-vous du jour par statut
              </h3>
              {stats.appointmentsToday.total === 0 ? (
                <div className="text-gray-400 text-sm">Aucun rendez-vous aujourd'hui.</div>
              ) : (
                <div className="flex flex-wrap gap-3">
                  {STATUS_ORDER.filter((s) => byStatus[s]).map((s) => (
                    <span
                      key={s}
                      className={`text-sm px-3 py-1 rounded-full font-medium ${STATUS_COLORS[s]}`}
                    >
                      {STATUS_LABELS[s]}: {byStatus[s]}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 mb-3">
                Types de rendez-vous (30 j)
              </h3>
              {typeEntries.length === 0 ? (
                <div className="text-gray-400 text-sm">Aucun rendez-vous sur la période.</div>
              ) : (
                <div className="space-y-2">
                  {typeEntries.map(([type, count]) => (
                    <div key={type} className="flex items-center gap-3">
                      <div className="w-32 text-sm text-gray-600 flex-shrink-0">
                        {TYPE_LABELS[type] || type}
                      </div>
                      <div className="flex-1 bg-gray-100 rounded h-5 overflow-hidden">
                        <div
                          className={`h-full ${BAR_COLOR}`}
                          style={{ width: maxType > 0 ? `${(count / maxType) * 100}%` : '0%' }}
                        />
                      </div>
                      <div className="w-8 text-sm text-gray-700 text-right flex-shrink-0">{count}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
