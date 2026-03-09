import { Sidebar } from '@/components/Sidebar';

export const AppLayout = ({ children }: { children: React.ReactNode }) => (
  <div className="flex min-h-screen">
    <Sidebar />
    <main
      style={{ marginLeft: 'var(--sidebar-width)', transition: 'margin-left 300ms ease-in-out' }}
      className="flex-1 min-w-0"
    >
      {children}
    </main>
  </div>
);
