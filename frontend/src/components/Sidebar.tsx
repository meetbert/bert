import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoData } from '@/contexts/DemoDataContext';
import { LayoutDashboard, FolderOpen, FileText, ChevronLeft, ChevronRight, Settings, LogOut } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const SIDEBAR_KEY = 'sidebar-collapsed';
const EXPANDED_WIDTH = 220;
const COLLAPSED_WIDTH = 64;

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/projects', label: 'Projects', icon: FolderOpen },
  { to: '/invoices', label: 'Invoices', icon: FileText },
];

export const Sidebar = () => {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(SIDEBAR_KEY) === 'true');
  const { user, signOut } = useAuth();
  const { isDemoMode, stopDemo } = useDemoData();
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-width', `${collapsed ? COLLAPSED_WIDTH : EXPANDED_WIDTH}px`);
  }, [collapsed]);

  useEffect(() => {
    const initial = localStorage.getItem(SIDEBAR_KEY) === 'true' ? COLLAPSED_WIDTH : EXPANDED_WIDTH;
    document.documentElement.style.setProperty('--sidebar-width', `${initial}px`);
  }, []);

  const toggle = () => {
    setCollapsed(prev => {
      const next = !prev;
      localStorage.setItem(SIDEBAR_KEY, String(next));
      return next;
    });
  };

  const initials = (() => {
    if (isDemoMode) return 'B';
    const name = user?.user_metadata?.full_name;
    if (name) return name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase();
    return user?.email?.[0]?.toUpperCase() ?? '?';
  })();

  const displayName = isDemoMode ? 'Bert Demo' : (user?.user_metadata?.full_name ?? user?.email ?? '');
  const email = isDemoMode ? '' : (user?.email ?? '');

  const handleSignOut = async () => {
    if (isDemoMode) { stopDemo(); navigate('/'); return; }
    await signOut();
    navigate('/login');
  };

  return (
    <>
      <aside
        className={`fixed top-0 left-0 h-screen bg-white border-r border-border flex flex-col transition-all duration-300 z-40 ${collapsed ? 'w-16' : 'w-[220px]'}`}
      >
        {/* Header */}
        <div className="p-3 border-b border-border shrink-0">
          <div className={`flex items-center rounded-md px-3 py-2 ${collapsed ? 'justify-center' : ''}`}>
            {isDemoMode ? (
              <button onClick={() => { stopDemo(); navigate('/'); }} className="font-extrabold text-primary text-xl hover:opacity-70 transition-opacity">Bert.</button>
            ) : (
              <span className="font-extrabold text-primary text-xl">Bert.</span>
            )}
          </div>
        </div>

        {/* Nav */}
        <div className="px-3 pt-3 shrink-0">
          <ul className="space-y-1">
            {navItems.map(({ to, label, icon: Icon }) => {
              const active = location.pathname === to || location.pathname.startsWith(to + '/');
              return (
                <li key={to}>
                  <Link
                    to={to}
                    title={collapsed ? label : undefined}
                    className={`flex items-center rounded-md text-sm transition-colors ${collapsed ? 'px-3 py-2 justify-center' : 'px-3 py-2'} ${
                      active
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    <div className="w-5 h-5 flex items-center justify-center shrink-0">
                      <Icon size={20} strokeWidth={2} />
                    </div>
                    {!collapsed && <span className="ml-3">{label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>

        {/* Footer */}
        <div className="mt-auto border-t border-border shrink-0">
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={`flex items-center w-full p-4 gap-3 hover:bg-muted transition-colors ${collapsed ? 'justify-center' : ''}`}
              >
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold text-primary">
                  {initials}
                </div>
                {!collapsed && (
                  <div className="min-w-0 flex-1 text-left">
                    <p className="text-sm font-medium truncate leading-tight">{displayName}</p>
                    {displayName !== email && <p className="text-xs text-muted-foreground truncate">{email}</p>}
                  </div>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent side="top" align="start" className="w-44 p-1">
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm hover:bg-muted transition-colors"
              >
                <Settings className="h-4 w-4" />
                Settings
              </button>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm text-destructive hover:bg-destructive/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {isDemoMode ? 'Exit demo' : 'Logout'}
              </button>
            </PopoverContent>
          </Popover>
        </div>
      </aside>

      {/* Collapse toggle */}
      <button
        onClick={toggle}
        className="fixed top-1/2 -translate-y-1/2 w-8 h-8 bg-white border-2 border-gray-300 rounded-full flex items-center justify-center shadow-lg hover:shadow-xl transition-all duration-200 hover:scale-110 z-50"
        style={{ left: collapsed ? '48px' : `${EXPANDED_WIDTH - 16}px` }}
      >
        {collapsed
          ? <ChevronRight size={16} className="text-gray-600" />
          : <ChevronLeft size={16} className="text-gray-600" />
        }
      </button>
    </>
  );
};
