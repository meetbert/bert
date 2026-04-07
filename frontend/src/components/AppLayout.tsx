import { Link } from 'react-router-dom';
import { Sidebar } from '@/components/Sidebar';
import { useWalkthrough } from '@/contexts/WalkthroughContext';
import { useDemoData } from '@/contexts/DemoDataContext';
import { buttonVariants } from '@/components/ui/button';

export const AppLayout = ({ children }: { children: React.ReactNode }) => {
  const { isActive: isTourActive } = useWalkthrough();
  const { isDemoMode } = useDemoData();

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

      {isDemoMode && (
        <nav
          className={`fixed left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-xl border border-border bg-card px-6 py-2.5 shadow-[0_2px_20px_rgba(0,0,0,0.10)] transition-all duration-500 ease-out ${
            isTourActive ? 'bottom-0 translate-y-full opacity-0' : 'bottom-4 translate-y-0 opacity-100'
          }`}
        >
          <span className="text-lg font-extrabold text-primary mr-1" style={{ letterSpacing: '-0.04em' }}>Bert.</span>
          <Link to="/login" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Log in
          </Link>
          <Link to="/login?signup=true" className={buttonVariants({ size: 'sm' })}>
            Sign up
          </Link>
          <a
            href="https://calendly.com/meetbert-info/30min"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonVariants({ size: 'sm' })}
            style={{ backgroundColor: '#0D0D0B' }}
          >
            Book a demo
          </a>
        </nav>
      )}
    </div>
  );
};
