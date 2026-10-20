'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Conversation, Message, PaginatedResponse } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, errorMessage } from '@/lib/ui';
import { ArrowLeft, Send } from 'lucide-react';

const POLL_MS = 5000;

export default function ConversationThreadPage({ params }: { params: { conversationId: string } }) {
  const conversationId = params.conversationId;
  const { user } = useAuth();
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/proxy/conversations/${conversationId}/messages?limit=100`);
      if (!res.ok) throw new Error(`Erreur ${res.status}`);
      const data: PaginatedResponse<Message> & { conversation: Conversation } = await res.json();
      setConversation(data.conversation);
      setMessages(data.data);
      setError('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [conversationId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;
    setSending(true);
    setError('');
    try {
      const res = await fetch(`/api/proxy/conversations/${conversationId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
      setContent('');
      await load();
      await fetch(`/api/proxy/conversations/${conversationId}/read`, { method: 'PATCH' }).catch(() => {});
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSending(false);
    }
  };

  const markRead = useCallback(() => {
    fetch(`/api/proxy/conversations/${conversationId}/read`, { method: 'PATCH' }).catch(() => {});
  }, [conversationId]);

  useEffect(() => {
    if (!loading && messages.length > 0) {
      markRead();
    }
  }, [loading, messages.length, markRead]);

  if (loading) return <div className="text-muted py-12 text-center">Chargement...</div>;

  return (
    <div className="space-y-4">
      <Link
        href="/dashboard/messages"
        className="inline-flex items-center gap-1 text-sm text-brand hover:underline"
      >
        <ArrowLeft size={16} /> Retour aux conversations
      </Link>

      <div className="card p-4">
        <div className="font-semibold text-foreground">
          {conversation ? `${conversation.client.firstName} ${conversation.client.lastName}` : 'Conversation'}
        </div>
        {conversation && <div className="text-sm text-muted">{conversation.client.email}</div>}
      </div>

      {error && <div className="bg-rose-50 text-rose-700 px-4 py-3 rounded-xl text-sm">{error}</div>}

      <div className="card p-4 space-y-3 max-h-[60vh] overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-muted text-sm text-center py-8">Aucun message</div>
        ) : (
          messages.map((msg) => {
            const mine = msg.senderId === user?.id;
            return (
              <div key={msg.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[75%] rounded-2xl px-4 py-2 ${
                    mine ? 'bg-brand text-white' : 'bg-brand-light text-foreground'
                  }`}
                >
                  {!mine && (
                    <div className="text-xs font-medium opacity-70 mb-0.5">
                      {msg.sender.firstName} {msg.sender.lastName}
                    </div>
                  )}
                  {msg.content && <div className="text-sm whitespace-pre-wrap break-words">{msg.content}</div>}
                  {msg.attachmentUrl && (
                    <a
                      href={msg.attachmentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-xs underline block mt-1"
                    >
                      Pièce jointe
                    </a>
                  )}
                  <div className={`text-[10px] mt-1 ${mine ? 'text-white/70' : 'text-muted'}`}>
                    {formatDateTime(msg.createdAt)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={send} className="card p-3 flex items-center gap-2">
        <input
          type="text"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Écrire un message..."
          className="flex-1 px-3 py-2 border border-border rounded-xl bg-surface focus:outline-none focus:ring-2 focus:ring-brand text-sm"
        />
        <button
          type="submit"
          disabled={sending || !content.trim()}
          className="flex items-center gap-1 bg-brand text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-brand-dark disabled:opacity-50"
        >
          <Send size={16} /> Envoyer
        </button>
      </form>
    </div>
  );
}
