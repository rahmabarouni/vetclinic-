'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Conversation, PaginatedResponse } from '@/lib/api';
import { formatDateTime, errorMessage } from '@/lib/ui';
import { MessagesSquare } from 'lucide-react';

export default function MessagesPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/proxy/conversations?limit=50');
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data: PaginatedResponse<Conversation> = await res.json();
      setConversations(data.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [load]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
        <MessagesSquare size={22} /> Conversations ({conversations.length})
      </h1>

      {error && <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      {loading ? (
        <div className="text-muted py-12 text-center">Chargement...</div>
      ) : conversations.length === 0 ? (
        <div className="text-center py-12 text-muted">Aucune conversation</div>
      ) : (
        <div className="card divide-y divide-border">
          {conversations.map((conv) => (
            <Link
              key={conv.id}
              href={`/dashboard/messages/${conv.id}`}
              className="flex items-center justify-between gap-4 p-4 hover:bg-brand-light transition-colors"
            >
              <div className="min-w-0">
                <div className="font-medium text-foreground truncate">
                  {conv.client.firstName} {conv.client.lastName}
                </div>
                <div className="text-sm text-muted truncate">
                  {conv.lastMessage?.content
                    ? `${conv.lastMessage.sender?.firstName ?? ''}: ${conv.lastMessage.content}`
                    : conv.client.email}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-xs text-muted">{formatDateTime(conv.updatedAt)}</div>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${conv.status === 'CLOSED' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'}`}
                >
                  {conv.status === 'CLOSED' ? 'Fermée' : 'Ouverte'}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
