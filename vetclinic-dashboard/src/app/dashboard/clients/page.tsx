'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ClientListItem, PaginatedResponse } from '@/lib/api';
import { errorMessage } from '@/lib/ui';
import { Search, ChevronLeft, ChevronRight, PawPrint, CalendarDays } from 'lucide-react';

export default function ClientsPage() {
  const [clients, setClients] = useState<ClientListItem[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (search) params.set('search', search);
      const res = await fetch(`/api/proxy/clients?${params.toString()}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Erreur ${res.status}`);
      }
      const data: PaginatedResponse<ClientListItem> = await res.json();
      setClients(data.data);
      setTotalPages(data.pagination.totalPages);
      setTotal(data.pagination.total);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    load();
  }, [load]);

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-xl font-bold text-foreground">Clients ({total})</h1>
        <form onSubmit={submitSearch} className="flex items-center gap-2">
          <div className="relative">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Nom, email, téléphone..."
              className="pl-10 pr-3 py-2 border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-brand text-sm w-64"
            />
          </div>
          <button
            type="submit"
            className="bg-brand text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-brand-dark"
          >
            Rechercher
          </button>
        </form>
      </div>

      {error && <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      {loading ? (
        <div className="text-muted py-12 text-center">Chargement...</div>
      ) : clients.length === 0 ? (
        <div className="text-center py-12 text-muted">Aucun client trouvé</div>
      ) : (
        <div className="space-y-3">
          {clients.map((client) => (
            <Link
              key={client.id}
              href={`/dashboard/clients/${client.id}`}
              className="card p-4 flex items-center justify-between gap-4 hover:border-brand transition-colors"
            >
              <div className="min-w-0">
                <div className="font-semibold text-foreground truncate">
                  {client.firstName} {client.lastName}
                </div>
                <div className="text-sm text-muted truncate">{client.email}</div>
                {client.phone && <div className="text-sm text-muted">{client.phone}</div>}
              </div>
              <div className="flex items-center gap-4 flex-shrink-0 text-sm text-muted">
                <span className="flex items-center gap-1">
                  <PawPrint size={16} /> {client.petsCount}
                </span>
                <span className="flex items-center gap-1">
                  <CalendarDays size={16} /> {client.appointmentsCount}
                </span>
                {!client.isActive && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                    Inactif
                  </span>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-brand-light disabled:opacity-40"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm text-muted">
            Page {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded-lg border border-border bg-surface hover:bg-brand-light disabled:opacity-40"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
