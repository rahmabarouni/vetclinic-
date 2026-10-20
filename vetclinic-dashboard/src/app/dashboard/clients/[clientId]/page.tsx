'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Appointment, ClientDetail } from '@/lib/api';
import {
  STATUS_LABELS,
  STATUS_STYLES,
  TYPE_LABELS,
  SPECIES_LABELS,
  SEX_LABELS,
  formatDate,
  formatDateTime,
} from '@/lib/ui';
import { ArrowLeft, Mail, Phone, MapPin, PawPrint, FileText, CalendarDays } from 'lucide-react';

export default function ClientDetailPage({ params }: { params: { clientId: string } }) {
  const clientId = params.clientId;
  const [client, setClient] = useState<ClientDetail | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch(`/api/proxy/clients/${clientId}`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`Erreur ${res.status}`))))
      .then((data) => {
        if (!active) return;
        setClient(data.client);
        setAppointments(data.appointments ?? []);
        setLoading(false);
      })
      .catch((err) => {
        if (!active) return;
        setError(err.message);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [clientId]);

  if (loading) return <div className="text-muted py-12 text-center">Chargement...</div>;
  if (error) return <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-xl text-sm">{error}</div>;
  if (!client) return null;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/clients"
        className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        <ArrowLeft size={16} /> Retour aux clients
      </Link>

      <div className="card p-6">
        <h1 className="text-xl font-bold text-foreground">
          {client.firstName} {client.lastName}
        </h1>
        <div className="mt-3 space-y-1 text-sm text-muted">
          <div className="flex items-center gap-2">
            <Mail size={16} /> {client.email}
          </div>
          {client.phone && (
            <div className="flex items-center gap-2">
              <Phone size={16} /> {client.phone}
            </div>
          )}
          {client.address && (
            <div className="flex items-center gap-2">
              <MapPin size={16} /> {client.address}
            </div>
          )}
          <div className="text-xs text-muted pt-1">
            Client depuis le {formatDate(client.createdAt)}
            {!client.isActive && ' — compte inactif'}
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <PawPrint size={20} /> Animaux ({client.pets.length})
        </h2>
        {client.pets.length === 0 ? (
          <div className="text-muted text-sm py-6 text-center card">Aucun animal</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {client.pets.map((pet) => (
              <div key={pet.id} className="card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-semibold text-foreground">{pet.name}</div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-brand-light text-brand">
                    {SPECIES_LABELS[pet.species] || pet.species}
                  </span>
                </div>
                <div className="text-sm text-muted mt-1">
                  {pet.breed || 'Race inconnue'} — {SEX_LABELS[pet.sex] || pet.sex}
                  {pet.birthDate && ` — né(e) le ${formatDate(pet.birthDate)}`}
                </div>
                <div className="flex flex-wrap gap-3 mt-3 text-xs text-muted">
                  <span className="flex items-center gap-1">
                    <FileText size={14} /> {pet.medicalRecordsCount} dossier(s)
                  </span>
                  <span className="flex items-center gap-1">
                    <CalendarDays size={14} /> {pet.appointmentsCount} RDV
                  </span>
                </div>
                <Link
                  href={`/dashboard/pets/${pet.id}/medical-records?petName=${encodeURIComponent(pet.name)}`}
                  className="inline-block mt-3 text-sm text-brand hover:underline"
                >
                  Voir le dossier médical
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h2 className="text-lg font-semibold text-foreground mb-3 flex items-center gap-2">
          <CalendarDays size={20} /> Rendez-vous ({appointments.length})
        </h2>
        {appointments.length === 0 ? (
          <div className="text-muted text-sm py-6 text-center card">Aucun rendez-vous</div>
        ) : (
          <div className="card divide-y divide-border">
            {appointments.map((apt) => (
              <div key={apt.id} className="p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-foreground">
                      {TYPE_LABELS[apt.appointmentType] || apt.appointmentType}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[apt.status] || 'bg-slate-100'}`}
                    >
                      {STATUS_LABELS[apt.status] || apt.status}
                    </span>
                  </div>
                  <div className="text-sm text-muted">
                    {apt.pet.name} — {formatDateTime(apt.scheduledStart)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
