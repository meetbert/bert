import { Link } from 'react-router-dom';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useScroll } from '@/components/ui/use-scroll';

export function LandingHeader() {
  const scrolled = useScroll(10);

  return (
    <header
      className={cn(
        'sticky z-50 mx-auto w-full transition-all duration-300 ease-out',
        scrolled
          ? 'top-3 max-w-4xl rounded-xl border border-border shadow-[0_2px_20px_rgba(0,0,0,0.10)]'
          : 'top-0 max-w-full border-0 shadow-none',
      )}
      style={{
        background: scrolled
          ? '#F8F8F6'
          : 'radial-gradient(ellipse 80% 120% at 50% 100%, rgba(255,66,66,0.06) 0%, transparent 70%), #FFFFFF',
      }}
    >
      <nav className="mx-auto flex h-14 w-full items-center justify-between px-6">
        {/* Logo */}
        <span className="text-xl font-extrabold tracking-tight text-primary" style={{ letterSpacing: '-0.04em' }}>
          Bert.
        </span>

        {/* Auth buttons */}
        <div className="flex items-center gap-2">
          <Link to="/login" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            Log in
          </Link>
          <Link to="/login?signup=true" className={buttonVariants({ size: 'sm' })}>
            Sign up
          </Link>
        </div>
      </nav>
    </header>
  );
}
