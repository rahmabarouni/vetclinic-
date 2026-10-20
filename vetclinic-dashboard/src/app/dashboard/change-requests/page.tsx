'use client';

import { useCallback, useEffect, useState } from 'react';
import { ChangeRequest, PaginatedResponse } from '@/lib/api';
import { TYPE_LABELS, formatDateTime, errorMessage } from '@/lib/ui';
import { Check, X, ClipboardList } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  APPROVED: 'Approuvée',
  REJECTED: 'Refusée',
};

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  REJECTED: 'bg-rose-100 text-rose-800',
};

export default function ChangeRequestsPage() {
  const [requests, setRequests] = useState<ChangeRequest[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('PENDING');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [noteById, setNoteById] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetch(`/api/proxy/change-requests?${params.toString()}`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data: PaginatedResponse<ChangeRequest> = await res.json();
      setRequests(data.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (id: string, action: 'approve' | 'reject') => {
    setProcessingId(id);
    setError('');
    setSuccess('');
    try {
      const note = noteById[id]?.trim();
      const res = await fetch(`/api/proxy/change-requests/${id}/${action}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note ? { responseNote: note } : {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      setSuccess(action === 'approve' ? 'Demande approuvée. Le rendez-vous a été mis à jour.' : 'Demande refusée.');
      setNoteById((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
          <ClipboardList size={22} /> Demandes de modification
        </h1>
        <div className="flex gap-2">
          <button
            onClick={() => setStatusFilter('PENDING')}
            className={`text-sm px-3 py-1.5 rounded-xl ${statusFilter === 'PENDING' ? 'bg-brand text-white' : 'bg-surface border border-border text-muted'}`}
          >
            En attente
          </button>
          <button
            onClick={() => setStatusFilter('')}
            className={`text-sm px-3 py-1.5 rounded-xl ${statusFilter === '' ? 'bg-brand text-white' : 'bg-surface border border-border text-muted'}`}
          >
            Toutes
          </button>
        </div>
      </div>

      {error && <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-xl text-sm">{error}</div>}
      {success && <div className="bg-emerald-50 text-emerald-800 px-4 py-3 rounded-xl text-sm">{success}</div>}

      {loading ? (
        <div className="text-muted py-12 text-center">Chargement...</div>
      ) : requests.length === 0 ? (
        <div className="text-center py-12 text-muted">Aucune demande</div>
      ) : (
        <div className="space-y-3">
          {requests.map((cr) => (
            <div key={cr.id} className="card p-4 space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="font-semibold text-foreground">
                      {TYPE_LABELS[cr.proposedType] || cr.proposedType}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[cr.status] || 'bg-slate-100'}`}>
                      {STATUS_LABELS[cr.status] || cr.status}
                    </span>
                  </div>
                  <div className="text-sm text-muted">
                    {cr.appointment.pet.name} — client {cr.appointment.client.firstName} {cr.appointment.client.lastName}
                  </div>
                  <div className="text-sm text-muted mt-1">
                    Actuel : {formatDateTime(cr.appointment.scheduledStart)} — {formatDateTime(cr.appointment.scheduledEnd)}
                  </div>
                  <div className="text-sm text-brand font-medium">
                    Proposé : {formatDateTime(cr.proposedStart)} — {formatDateTime(cr.proposedEnd)}
                  </div>
                  {cr.proposedReason && (
                    <div className="text-sm text-muted mt-1">Motif : {cr.proposedReason}</div>
                  )}
                  <div className="text-xs text-muted mt-1">
                    Demandé par {cr.requestedBy.firstName} {cr.requestedBy.lastName} le {formatDateTime(cr.createdAt)}
                  </div>
                  {cr.status !== 'PENDING' && cr.responseNote && (
                    <div className="text-xs text-muted mt-1">Note : {cr.responseNote}</div>
                  )}
                </div>
              </div>

              {cr.status === 'PENDING' && (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={noteById[cr.id] ?? ''}
                    onChange={(e) => setNoteById((prev) => ({ ...prev, [cr.id]: e.target.value }))}
                    placeholder="Note de réponse (optionnelle)"
                    className="w-full px-3 py-2 border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-brand text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(cr.id, 'approve')}
                      disabled={processingId === cr.id}
                      className="flex items-center gap-1 bg-emerald-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check size={16} /> Approuver
                    </button>
                    <button
                      onClick={() => act(cr.id, 'reject')}
                      disabled={processingId === cr.id}
                      className="flex items-center gap-1 bg-rose-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-rose-700 disabled:opacity-50"
                    >
                      <X size={16} /> Refuser
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
