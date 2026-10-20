export const STATUS_LABELS: Record<string, string> = {
  PENDING: 'En attente',
  CONFIRMED: 'Confirmé',
  COMPLETED: 'Terminé',
  CANCELLED: 'Annulé',
  NO_SHOW: 'Absent',
};

export const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  CONFIRMED: 'bg-emerald-100 text-emerald-800',
  COMPLETED: 'bg-sky-100 text-sky-800',
  CANCELLED: 'bg-rose-100 text-rose-800',
  NO_SHOW: 'bg-slate-100 text-slate-700',
};

export const TYPE_LABELS: Record<string, string> = {
  CONSULTATION: 'Consultation',
  VACCINATION: 'Vaccination',
  SURGERY: 'Chirurgie',
  EMERGENCY: 'Urgence',
  CHECKUP: 'Contrôle',
  GROOMING: 'Toilettage',
  OTHER: 'Autre',
};

export const SPECIES_LABELS: Record<string, string> = {
  DOG: 'Chien',
  CAT: 'Chat',
  BIRD: 'Oiseau',
  RABBIT: 'Lapin',
  RODENT: 'Rongeur',
  REPTILE: 'Reptile',
  OTHER: 'Autre',
};

export const SEX_LABELS: Record<string, string> = {
  MALE: 'Mâle',
  FEMALE: 'Femelle',
  UNKNOWN: 'Inconnu',
};

export function formatDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
}

export function toInputValue(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function inputValueToIso(value: string) {
  return new Date(value).toISOString();
}

export function errorMessage(err: unknown, fallback = 'Une erreur est survenue') {
  return err instanceof Error ? err.message : fallback;
}
