'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { MedicalRecord, Reminder } from '@/lib/api';

const RECORD_TYPES = ['CONSULTATION', 'VACCINATION', 'SURGERY', 'TREATMENT', 'ALLERGY', 'OTHER'] as const;

const RECORD_TYPE_LABELS: Record<string, string> = {
  CONSULTATION: 'Consultation',
  VACCINATION: 'Vaccination',
  SURGERY: 'Chirurgie',
  TREATMENT: 'Traitement',
  ALLERGY: 'Allergie',
  OTHER: 'Autre',
};

const RECORD_TYPE_COLORS: Record<string, string> = {
  CONSULTATION: 'bg-blue-100 text-blue-800',
  VACCINATION: 'bg-green-100 text-green-800',
  SURGERY: 'bg-purple-100 text-purple-800',
  TREATMENT: 'bg-orange-100 text-orange-800',
  ALLERGY: 'bg-red-100 text-red-800',
  OTHER: 'bg-gray-100 text-gray-800',
};

const REMINDER_TYPE_LABELS: Record<string, string> = {
  VACCINE: 'Vaccin',
  CHECKUP: 'Contrôle',
  TREATMENT: 'Traitement',
  OTHER: 'Autre',
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function MedicalRecordsPage({
  params,
  searchParams,
}: {
  params: { petId: string };
  searchParams: {
    appointmentId?: string;
    petName?: string;
    veterinarianId?: string;
    vetName?: string;
    new?: string;
  };
}) {
  const petId = params.petId;
  const appointmentId = searchParams.appointmentId ?? '';
  const petName = searchParams.petName ?? '';
  const veterinarianId = searchParams.veterinarianId ?? '';
  const vetName = searchParams.vetName ?? '';

  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [records, setRecords] = useState<MedicalRecord[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showForm, setShowForm] = useState(searchParams.new === '1');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [recordType, setRecordType] = useState<string>('CONSULTATION');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [diagnosis, setDiagnosis] = useState('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
  }, [user, authLoading, router]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/pets/${petId}/medical-records`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      const data = await res.json();
      setRecords(data.medicalRecords ?? []);
      setReminders(data.reminders ?? []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [petId]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setSuccess('');
    if (!veterinarianId) {
      setFormError("Vétérinaire auteur introuvable. Ouvrez ce formulaire depuis un rendez-vous.");
      return;
    }
    if (!title.trim()) {
      setFormError('Le titre est obligatoire.');
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        petId,
        veterinarianId,
        recordType,
        title: title.trim(),
      };
      if (appointmentId) body.appointmentId = appointmentId;
      if (description.trim()) body.description = description.trim();
      if (diagnosis.trim()) body.diagnosis = diagnosis.trim();

      const res = await fetch('/api/proxy/medical-records', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 409) {
          throw new Error(data.error || 'Un dossier médical existe déjà pour ce rendez-vous.');
        }
        throw new Error(data.error || `Erreur ${res.status}`);
      }

      const reminder = data.reminder as Reminder | null;
      if (reminder) {
        setSuccess(
          `Note enregistrée. Un rappel de vaccin a été programmé pour le ${formatDate(reminder.dueDate)}.`
        );
      } else {
        setSuccess('Note enregistrée.');
      }
      setTitle('');
      setDescription('');
      setDiagnosis('');
      setRecordType('CONSULTATION');
      setShowForm(false);
      await load();
    } catch (err: any) {
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user) {
    return (
      <div className="text-muted py-12 text-center">Chargement...</div>
    );
  }

  return (
    <div>
      <header className="mb-6">
        <Link href="/dashboard/appointments" className="text-sm text-brand hover:underline">
          &larr; Retour aux rendez-vous
        </Link>
        <h1 className="text-xl font-bold text-foreground mt-1">
          Dossier médical{petName ? ` — ${petName}` : ''}
        </h1>
        <p className="text-xs text-muted">Animal: {petId}</p>
      </header>

      <div className="max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Notes de consultation ({records.length})
          </h2>
          <button
            onClick={() => { setShowForm((v) => !v); setFormError(''); setSuccess(''); }}
            className="bg-green-600 text-white text-sm px-3 py-2 rounded-md font-medium hover:bg-green-700"
          >
            {showForm ? 'Fermer le formulaire' : 'Ajouter une note de consultation'}
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md text-sm">{error}</div>
        )}
        {success && (
          <div className="bg-green-50 text-green-800 px-4 py-3 rounded-md text-sm">{success}</div>
        )}

        {showForm && (
          <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-4">
            <h3 className="font-semibold text-gray-900">Nouvelle note de consultation</h3>

            {appointmentId && (
              <p className="text-xs text-gray-500">
                Liée au rendez-vous <span className="font-mono">{appointmentId}</span>
              </p>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value={recordType}
                onChange={(e) => setRecordType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              >
                {RECORD_TYPES.map((t) => (
                  <option key={t} value={t}>{RECORD_TYPE_LABELS[t]}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Titre</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Diagnostic</label>
              <textarea
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                rows={2}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vétérinaire auteur</label>
              {veterinarianId ? (
                <p className="text-sm text-gray-600">{vetName || 'Vétérinaire du rendez-vous'}</p>
              ) : (
                <p className="text-sm text-red-600">
                  Auteur inconnu : ouvrez ce formulaire depuis un rendez-vous.
                </p>
              )}
            </div>

            {recordType === 'VACCINATION' && (
              <p className="text-xs text-blue-700 bg-blue-50 px-3 py-2 rounded-md">
                Une vaccination programme automatiquement un rappel à +12 mois.
              </p>
            )}

            {formError && (
              <div className="bg-red-50 text-red-700 px-4 py-3 rounded-md text-sm">{formError}</div>
            )}

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={submitting || !veterinarianId}
                className="bg-green-600 text-white px-4 py-2 rounded-md font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? 'Enregistrement...' : 'Enregistrer la note'}
              </button>
              <button
                type="button"
                onClick={() => { setShowForm(false); setFormError(''); }}
                className="px-4 py-2 rounded-md text-gray-600 hover:bg-gray-100"
              >
                Annuler
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <div className="text-gray-400 text-center py-8">Chargement...</div>
        ) : records.length === 0 ? (
          <div className="text-center py-12 text-gray-400">Aucune note pour cet animal</div>
        ) : (
          <div className="space-y-3">
            {records.map((rec) => (
              <div key={rec.id} id={`record-${rec.id}`} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 scroll-mt-24">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${RECORD_TYPE_COLORS[rec.recordType] || 'bg-gray-100 text-gray-800'}`}>
                    {RECORD_TYPE_LABELS[rec.recordType] || rec.recordType}
                  </span>
                  <span className="font-semibold text-gray-900">{rec.title}</span>
                </div>
                {rec.description && (
                  <p className="text-sm text-gray-700 mb-1">{rec.description}</p>
                )}
                {rec.diagnosis && (
                  <p className="text-sm text-gray-700 mb-1">
                    <span className="font-medium">Diagnostic:</span> {rec.diagnosis}
                  </p>
                )}
                <div className="text-xs text-gray-400 mt-2">
                  {formatDateTime(rec.createdAt)}
                  {rec.veterinarian && (
                    <> — Dr {rec.veterinarian.user.firstName} {rec.veterinarian.user.lastName}</>
                  )}
                  {rec.appointmentId && <> — RDV {rec.appointmentId.slice(0, 8)}</>}
                </div>
              </div>
            ))}
          </div>
        )}

        <div>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Rappels ({reminders.length})
          </h2>
          {reminders.length === 0 ? (
            <div className="text-center py-8 text-gray-400 bg-white rounded-lg border border-gray-200">
              Aucun rappel pour cet animal
            </div>
          ) : (
            <div className="space-y-2">
              {reminders.map((r) => (
                <div key={r.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-medium text-gray-900 truncate">{r.title}</div>
                    <div className="text-xs text-gray-500">
                      {REMINDER_TYPE_LABELS[r.reminderType] || r.reminderType} — échéance le {formatDate(r.dueDate)}
                    </div>
                  </div>
                  <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${r.isCompleted ? 'bg-gray-100 text-gray-600' : 'bg-yellow-100 text-yellow-800'}`}>
                    {r.isCompleted ? 'Traité' : 'À venir'}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
