import { Sidebar } from '@/components/Sidebar';
import { useWalkthrough } from '@/contexts/WalkthroughContext';
import { useUserSettings } from '@/hooks/useUserSettings';
import { useDemoData } from '@/contexts/DemoDataContext';

export const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { isActive: isTourActive } = useWalkthrough();
  const { settings, loading } = useUserSettings();
  const { isDemoMode } = useDemoData();

  const showGetStarted = !loading && (isDemoMode || !settings?.agentmail_inbox);

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main
        style={{
          marginLeft: 'var(--sidebar-width)',
          transition: isTourActive ? 'none' : 'margin-left 300ms ease-in-out',
          background: [
            'radial-gradient(ellipse 80% 50% at 70% 0%, rgba(255,66,66,0.045) 0%, transparent 65%)',
            'radial-gradient(ellipse 60% 50% at 0% 60%, rgba(255,66,66,0.03) 0%, transparent 65%)',
          ].join(', '),
        }}
        className="flex-1 min-w-0"
      >
        {children}
      </main>

      {showGetStarted && (
        <a
          href="https://calendly.com/meetbert-info/30min"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            left: 'calc(var(--sidebar-width) + (100% - var(--sidebar-width)) / 2)',
            transition: isTourActive ? 'bottom 500ms ease-out, opacity 500ms ease-out, transform 500ms ease-out' : 'left 300ms ease-in-out, bottom 500ms ease-out, opacity 500ms ease-out, transform 500ms ease-out',
          }}
          className={`fixed z-50 -translate-x-1/2 inline-flex items-center rounded-xl border border-border bg-primary px-8 py-3 text-sm font-medium text-primary-foreground shadow-[0_2px_20px_rgba(0,0,0,0.10)] hover:bg-primary/90 ${
            isTourActive ? 'bottom-0 translate-y-full opacity-0' : 'bottom-6 translate-y-0 opacity-100'
          }`}
        >
          Get started
        </a>
      )}
    </div>
  );
};
