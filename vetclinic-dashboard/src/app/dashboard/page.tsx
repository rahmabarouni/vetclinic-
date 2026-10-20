'use client';

import { useEffect, useState } from 'react';
import { DashboardStats } from '@/lib/api';
import { STATUS_LABELS, TYPE_LABELS } from '@/lib/ui';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { CalendarCheck, UserPlus, Ban, MailWarning } from 'lucide-react';

const STATUS_COLORS: Record<string, string> = {
  PENDING: '#f59e0b',
  CONFIRMED: '#10b981',
  COMPLETED: '#0ea5e9',
  CANCELLED: '#f43f5e',
  NO_SHOW: '#94a3b8',
};

function StatCard({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  hint?: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}) {
  return (
    <div className="card p-5 flex items-start justify-between gap-4">
      <div>
        <div className="text-sm text-muted">{label}</div>
        <div className="text-3xl font-bold text-foreground mt-1">{value}</div>
        {hint && <div className="text-xs text-muted mt-1">{hint}</div>}
      </div>
      <div className="p-3 rounded-xl bg-brand-light text-brand">
        <Icon size={24} />
      </div>
    </div>
  );
}

export default function DashboardStatsPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
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
  }, []);

  if (loading) {
    return <div className="text-muted py-12 text-center">Chargement...</div>;
  }

  const perDay = (stats?.appointmentsPerDay ?? []).map((d) => ({
    ...d,
    label: `${d.date.slice(8, 10)}/${d.date.slice(5, 7)}`,
  }));

  const types = stats?.appointmentTypesLast30Days ?? {};
  const typeData = Object.entries(types)
    .map(([type, count]) => ({ name: TYPE_LABELS[type] || type, count }))
    .sort((a, b) => b.count - a.count);

  const byStatus30 = stats?.appointmentsByStatusLast30Days ?? {};
  const statusData = Object.entries(byStatus30).map(([status, count]) => ({
    name: STATUS_LABELS[status] || status,
    value: count,
    status,
  }));

  const total30 = statusData.reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold text-foreground">Tableau de bord</h1>

      {error && (
        <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-xl text-sm">{error}</div>
      )}

      {!stats ? (
        <div className="text-center py-12 text-muted">Aucune donnée</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Rendez-vous aujourd'hui"
              value={stats.appointmentsToday.total}
              icon={CalendarCheck}
            />
            <StatCard label="Nouveaux clients (30 j)" value={stats.newClientsLast30Days} icon={UserPlus} />
            <StatCard
              label="Taux d'annulation (30 j)"
              value={stats.cancellationRate.rate}
              hint={`${stats.cancellationRate.cancelled} / ${stats.cancellationRate.total} RDV`}
              icon={Ban}
            />
            <StatCard label="Messages non lus" value={stats.unreadMessages} icon={MailWarning} />
          </div>

          <div className="card p-5">
            <h3 className="font-semibold text-foreground mb-4">Rendez-vous par jour (30 derniers jours)</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={perDay} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e9f2" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Rendez-vous"
                    stroke="#4a7fc9"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card p-5">
              <h3 className="font-semibold text-foreground mb-4">Types de rendez-vous (30 j)</h3>
              <div className="h-72">
                {typeData.length === 0 ? (
                  <div className="text-muted text-sm">Aucun rendez-vous sur la période.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={typeData} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e9f2" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="count" name="Rendez-vous" fill="#4a7fc9" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="card p-5">
              <h3 className="font-semibold text-foreground mb-4">Statuts (30 j)</h3>
              <div className="h-72">
                {total30 === 0 ? (
                  <div className="text-muted text-sm">Aucun rendez-vous sur la période.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={statusData}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={90}
                        paddingAngle={2}
                      >
                        {statusData.map((entry) => (
                          <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || '#94a3b8'} />
                        ))}
                      </Pie>
                      <Tooltip />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
