'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Appointment,
  ClientListItem,
  PaginatedResponse,
  PetSummary,
  VeterinarianListItem,
} from '@/lib/api';
import {
  STATUS_LABELS,
  STATUS_STYLES,
  TYPE_LABELS,
  formatDateTime,
  toInputValue,
  inputValueToIso,
  errorMessage,
} from '@/lib/ui';
import { Plus, Pencil, X, Search, CalendarDays } from 'lucide-react';

const STATUS_OPTIONS = ['PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'] as const;
const TYPE_OPTIONS = ['CONSULTATION', 'VACCINATION', 'SURGERY', 'EMERGENCY', 'CHECKUP', 'GROOMING', 'OTHER'] as const;

export default function AppointmentsPage() {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Appointment | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/proxy/appointments?page=1&limit=50');
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data: PaginatedResponse<Appointment> = await res.json();
      setAppointments(data.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleStatusChange = async (appointmentId: string, newStatus: string) => {
    setUpdatingId(appointmentId);
    setError('');
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
      setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? data.appointment : a)));
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setUpdatingId(null);
    }
  };

  const handleCancel = async (appointmentId: string) => {
    if (!confirm('Annuler ce rendez-vous ?')) return;
    await handleStatusChange(appointmentId, 'CANCELLED');
  };

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <CalendarDays size={22} /> Rendez-vous ({appointments.length})
        </h1>
        <button
          onClick={() => { setEditing(null); setShowForm(true); }}
          className="flex items-center gap-2 bg-brand text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-brand-dark"
        >
          <Plus size={18} /> Nouveau RDV
        </button>
      </div>

      {error && <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {success && <div className="bg-emerald-50 text-emerald-800 px-4 py-3 rounded-xl text-sm">{success}</div>}

      {showForm && (
        <AppointmentForm
          editing={editing}
          onClose={closeForm}
          onSaved={(message) => {
            setSuccess(message);
            closeForm();
            load();
          }}
          onError={setError}
        />
      )}

      {loading ? (
        <div className="text-muted py-12 text-center">Chargement...</div>
      ) : appointments.length === 0 ? (
        <div className="text-center py-12 text-muted">Aucun rendez-vous</div>
      ) : (
        <div className="space-y-3">
          {appointments.map((apt) => {
            const recordBase = `/dashboard/pets/${apt.petId}/medical-records?appointmentId=${apt.id}&petName=${encodeURIComponent(apt.pet.name)}${apt.veterinarianId ? `&veterinarianId=${apt.veterinarianId}` : ''}${apt.veterinarian ? `&vetName=${encodeURIComponent(`Dr ${apt.veterinarian.user.firstName} ${apt.veterinarian.user.lastName}`)}` : ''}`;
            const canModify = apt.status === 'PENDING' || apt.status === 'CONFIRMED';
            return (
              <div key={apt.id} className="card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className="font-semibold text-foreground">
                        {TYPE_LABELS[apt.appointmentType] || apt.appointmentType}
                      </span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[apt.status] || 'bg-slate-100'}`}
                      >
                        {STATUS_LABELS[apt.status] || apt.status}
                      </span>
                      {apt.pendingChangeRequest && (
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-800">
                          Demande de modification en attente
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-muted">
                      {apt.pet.name} ({apt.pet.species})
                    </div>
                    <div className="text-sm text-muted">
                      Client: {apt.client.firstName} {apt.client.lastName}
                    </div>
                    <div className="text-sm text-muted">
                      {formatDateTime(apt.scheduledStart)} — {formatDateTime(apt.scheduledEnd)}
                    </div>
                    {apt.reason && <div className="text-sm text-muted mt-1">Motif: {apt.reason}</div>}
                    <div className="flex flex-wrap gap-3 mt-2">
                      <Link href={recordBase} className="text-sm text-brand hover:underline">
                        Voir le dossier médical
                      </Link>
                      {apt.medicalRecord ? (
                        <Link href={`${recordBase}#record-${apt.medicalRecord.id}`} className="text-sm text-muted hover:underline">
                          Voir la note
                        </Link>
                      ) : (
                        <Link href={`${recordBase}&new=1`} className="text-sm text-brand hover:underline">
                          Ajouter une note de consultation
                        </Link>
                      )}
                    </div>
                  </div>

                  <div className="flex-shrink-0 flex flex-col items-end gap-2">
                    <select
                      value={apt.status}
                      onChange={(e) => handleStatusChange(apt.id, e.target.value)}
                      disabled={updatingId === apt.id}
                      className="text-sm border border-border rounded-lg px-2 py-1 bg-surface focus:outline-none focus:ring-2 focus:ring-brand disabled:opacity-50"
                    >
                      {STATUS_OPTIONS.map((s) => (
                        <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                      ))}
                    </select>
                    {canModify && (
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          onClick={() => { setEditing(apt); setShowForm(true); }}
                          className="flex items-center gap-1 text-brand hover:underline"
                        >
                          <Pencil size={14} /> Modifier
                        </button>
                        <button
                          onClick={() => handleCancel(apt.id)}
                          className="flex items-center gap-1 text-rose-600 hover:underline"
                        >
                          <X size={14} /> Annuler
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AppointmentForm({
  editing,
  onClose,
  onSaved,
  onError,
}: {
  editing: Appointment | null;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}) {
  const [vets, setVets] = useState<VeterinarianListItem[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [clientResults, setClientResults] = useState<ClientListItem[]>([]);
  const [selectedClient, setSelectedClient] = useState<ClientListItem | null>(null);
  const [pets, setPets] = useState<PetSummary[]>([]);
  const [petId, setPetId] = useState(editing?.petId ?? '');
  const [veterinarianId, setVeterinarianId] = useState(editing?.veterinarianId ?? '');
  const [appointmentType, setAppointmentType] = useState(editing?.appointmentType ?? 'CONSULTATION');
  const [start, setStart] = useState(editing ? toInputValue(editing.scheduledStart) : '');
  const [end, setEnd] = useState(editing ? toInputValue(editing.scheduledEnd) : '');
  const [reason, setReason] = useState(editing?.reason ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    fetch('/api/proxy/veterinarians?availableOnly=true')
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((data) => setVets(data.data ?? []))
      .catch(() => {});
  }, []);

  const searchClients = async () => {
    if (!clientSearch.trim()) return;
    const res = await fetch(`/api/proxy/clients?search=${encodeURIComponent(clientSearch.trim())}&limit=10`);
    if (res.ok) {
      const data: PaginatedResponse<ClientListItem> = await res.json();
      setClientResults(data.data);
    }
  };

  const pickClient = async (client: ClientListItem) => {
    setSelectedClient(client);
    setClientResults([]);
    setClientSearch('');
    const res = await fetch(`/api/proxy/clients/${client.id}`);
    if (res.ok) {
      const data = await res.json();
      setPets(data.client.pets ?? []);
      if (editing && editing.clientId !== client.id) setPetId('');
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!start || !end) {
      setFormError('Les dates de début et de fin sont obligatoires.');
      return;
    }
    if (new Date(end) <= new Date(start)) {
      setFormError('La fin doit être postérieure au début.');
      return;
    }

    setSubmitting(true);
    try {
      if (editing) {
        const res = await fetch(`/api/proxy/appointments/${editing.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            scheduledStart: inputValueToIso(start),
            scheduledEnd: inputValueToIso(end),
            appointmentType,
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
        onSaved('Rendez-vous modifié. Le client a été notifié.');
      } else {
        if (!petId) {
          setFormError('Sélectionnez un animal.');
          setSubmitting(false);
          return;
        }
        const res = await fetch('/api/proxy/appointments', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            petId,
            ...(selectedClient ? { clientId: selectedClient.id } : {}),
            ...(veterinarianId ? { veterinarianId } : {}),
            appointmentType,
            scheduledStart: inputValueToIso(start),
            scheduledEnd: inputValueToIso(end),
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
        onSaved('Rendez-vous créé et confirmé. Le client a été notifié.');
      }
    } catch (err) {
      setFormError(errorMessage(err));
      onError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground">
          {editing ? 'Modifier le rendez-vous' : 'Nouveau rendez-vous pour un client'}
        </h3>
        <button type="button" onClick={onClose} className="text-muted hover:text-rose-600">
          <X size={20} />
        </button>
      </div>

      {!editing && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Client</label>
          {selectedClient ? (
            <div className="flex items-center justify-between bg-brand-light px-3 py-2 rounded-xl text-sm">
              <span className="text-foreground">
                {selectedClient.firstName} {selectedClient.lastName} — {selectedClient.email}
              </span>
              <button
                type="button"
                onClick={() => { setSelectedClient(null); setPets([]); setPetId(''); }}
                className="text-muted hover:text-rose-600"
              >
                <X size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                <input
                  type="text"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); searchClients(); } }}
                  placeholder="Rechercher un client (nom, email...)"
                  className="w-full pl-10 pr-3 py-2 border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                />
              </div>
              <button
                type="button"
                onClick={searchClients}
                className="px-3 py-2 rounded-xl border border-border bg-surface text-sm hover:bg-brand-light"
              >
                Chercher
              </button>
            </div>
          )}
          {clientResults.length > 0 && (
            <div className="mt-2 border border-border rounded-xl divide-y divide-border bg-surface max-h-48 overflow-y-auto">
              {clientResults.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => pickClient(c)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-brand-light"
                >
                  {c.firstName} {c.lastName} — {c.email}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {!editing && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Animal</label>
          <select
            value={petId}
            onChange={(e) => setPetId(e.target.value)}
            disabled={!selectedClient}
            className="w-full px-3 py-2 border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-brand text-sm disabled:opacity-50"
          >
            <option value="">{selectedClient ? 'Sélectionner un animal' : 'Choisissez d’abord un client'}</option>
            {pets.map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.species})</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Vétérinaire</label>
        <select
          value={veterinarianId}
          onChange={(e) => setVeterinarianId(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-brand text-sm"
        >
          <option value="">Non assigné</option>
          {vets.map((v) => (
            <option key={v.id} value={v.id}>
              Dr {v.user.firstName} {v.user.lastName}{v.specialty ? ` — ${v.specialty}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Type</label>
        <select
          value={appointmentType}
          onChange={(e) => setAppointmentType(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-brand text-sm"
        >
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>{TYPE_LABELS[t]}</option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Début</label>
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-brand text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-foreground mb-1">Fin</label>
          <input
            type="datetime-local"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="w-full px-3 py-2 border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-brand text-sm"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-foreground mb-1">Motif</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="w-full px-3 py-2 border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-brand text-sm"
        />
      </div>

      {formError && <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-xl text-sm">{formError}</div>}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="bg-brand text-white px-4 py-2 rounded-xl font-medium hover:bg-brand-dark disabled:opacity-50"
        >
          {submitting ? 'Enregistrement...' : editing ? 'Enregistrer' : 'Créer le rendez-vous'}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-muted hover:bg-brand-light"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}
