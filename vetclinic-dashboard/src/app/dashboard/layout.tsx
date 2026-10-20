'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  LayoutDashboard,
  CalendarDays,
  ClipboardList,
  Users,
  MessagesSquare,
  LogOut,
  PawPrint,
  Menu,
} from 'lucide-react';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  badgeKey?: 'changeRequests' | 'unreadMessages';
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Tableau de bord', icon: LayoutDashboard },
  { href: '/dashboard/appointments', label: 'Rendez-vous', icon: CalendarDays },
  { href: '/dashboard/change-requests', label: 'Demandes de modification', icon: ClipboardList, badgeKey: 'changeRequests' },
  { href: '/dashboard/clients', label: 'Clients', icon: Users },
  { href: '/dashboard/messages', label: 'Messages', icon: MessagesSquare, badgeKey: 'unreadMessages' },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [badges, setBadges] = useState({ changeRequests: 0, unreadMessages: 0 });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (!user) return;
    let active = true;
    const loadBadges = async () => {
      try {
        const [statsRes, crRes] = await Promise.all([
          fetch('/api/proxy/dashboard/stats'),
          fetch('/api/proxy/change-requests?status=PENDING&limit=1'),
        ]);
        if (!active) return;
        const stats = statsRes.ok ? await statsRes.json() : null;
        const cr = crRes.ok ? await crRes.json() : null;
        setBadges({
          changeRequests: cr?.pagination?.total ?? 0,
          unreadMessages: stats?.stats?.unreadMessages ?? 0,
        });
      } catch {
        /* badges are non-critical */
      }
    };
    loadBadges();
    const interval = setInterval(loadBadges, 15000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-muted">Chargement...</div>
      </div>
    );
  }

  const isActive = (href: string) =>
    href === '/dashboard' ? pathname === '/dashboard' : pathname.startsWith(href);

  return (
    <div className="min-h-screen flex bg-background">
      <aside
        className={`${collapsed ? 'w-16' : 'w-64'} flex-shrink-0 bg-surface border-r border-border flex flex-col transition-all duration-200`}
      >
        <div className="h-16 flex items-center gap-2 px-4 border-b border-border">
          <div className="text-brand flex-shrink-0">
            <PawPrint size={26} />
          </div>
          {!collapsed && <span className="font-bold text-foreground whitespace-nowrap">VetClinic</span>}
        </div>

        <nav className="flex-1 p-2 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            const badge = item.badgeKey ? badges[item.badgeKey] : 0;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                  active
                    ? 'bg-brand text-white font-medium'
                    : 'text-foreground/70 hover:bg-brand-light hover:text-brand'
                }`}
              >
                <Icon size={20} className="flex-shrink-0" />
                {!collapsed && <span className="flex-1 whitespace-nowrap">{item.label}</span>}
                {badge > 0 && (
                  <span
                    className={`${collapsed ? 'absolute top-1 right-1' : ''} min-w-[20px] h-5 px-1.5 flex items-center justify-center rounded-full text-xs font-semibold ${
                      active ? 'bg-white text-brand' : 'bg-rose-500 text-white'
                    }`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="p-2 border-t border-border">
          {!collapsed && (
            <div className="px-3 py-2">
              <div className="text-sm font-medium text-foreground truncate">
                {user.firstName} {user.lastName}
              </div>
              <div className="text-xs text-muted truncate">{user.role}</div>
            </div>
          )}
          <button
            onClick={() => { logout(); router.push('/login'); }}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-foreground/70 hover:bg-rose-50 hover:text-rose-600"
            title="Déconnexion"
          >
            <LogOut size={20} className="flex-shrink-0" />
            {!collapsed && <span>Déconnexion</span>}
          </button>
        </div>
      </aside>

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-16 flex items-center px-4 border-b border-border bg-surface">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="p-2 rounded-lg text-muted hover:bg-brand-light hover:text-brand"
            aria-label="Replier le menu"
          >
            <Menu size={20} />
          </button>
        </header>
        <main className="flex-1 min-w-0 p-6 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
