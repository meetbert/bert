import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoData } from '@/contexts/DemoDataContext';
import { supabase } from '@/lib/supabase';
import { resolvePostAuthRoute } from '@/lib/authRouting';
import { LandingChat } from '@/components/LandingChat';
import { useWalkthrough } from '@/contexts/WalkthroughContext';
import { Mail, BarChart3, AlertTriangle, MessageSquare, ArrowRight } from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Receive an invoice',
    description: 'Vendors email invoices to your dedicated Bert inbox. No manual uploads needed.',
  },
  {
    number: '02',
    title: 'Bert extracts & categorises',
    description: 'Our AI pipeline reads the invoice, pulls out every field, and assigns it to the right project.',
  },
  {
    number: '03',
    title: 'See it in your dashboard',
    description: 'Structured data lands in your dashboard instantly — searchable, filterable, always up to date.',
  },
];

const features = [
  {
    icon: <Mail className="h-5 w-5 text-primary" />,
    title: 'Email-first ingestion',
    description: 'Every user gets a dedicated inbox. Vendors send directly to Bert — no forwarding required.',
  },
  {
    icon: <BarChart3 className="h-5 w-5 text-primary" />,
    title: 'Project budget tracking',
    description: 'Assign invoices to productions, set category budgets, and track spend in real time.',
  },
  {
    icon: <AlertTriangle className="h-5 w-5 text-primary" />,
    title: 'Overdue & cashflow alerts',
    description: 'Bert flags overdue payments and unpaid invoices so nothing slips through the cracks.',
  },
  {
    icon: <MessageSquare className="h-5 w-5 text-primary" />,
    title: 'Ask Bert anything',
    description: 'Chat with your data — query spend by vendor, project, or category in plain English.',
  },
];

const Landing = () => {
  const { user, loading } = useAuth();
  const { startDemo } = useDemoData();
  const { start: startTour } = useWalkthrough();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading || !user) return;

    supabase
      .from('user_settings')
      .select('onboarding_done')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        navigate(resolvePostAuthRoute(user, data), { replace: true });
      });
  }, [user, loading, navigate]);

  if (loading) return null;

  const handleTryDemo = () => {
    startDemo();
    startTour();
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <header className="border-b">
        <div className="container flex h-16 items-center justify-between">
          <span className="text-xl font-extrabold tracking-tight text-primary">Bert.</span>
          <Button variant="ghost" asChild>
            <Link to="/login">Log in</Link>
          </Button>
        </div>
      </header>

      <main className="flex-1">
        {/* Hero */}
        <section className="container flex flex-col items-center justify-center py-28 text-center">
          <h1 className="text-6xl font-extrabold tracking-tight text-primary sm:text-8xl">Bert.</h1>
          <p className="mt-3 text-sm font-medium uppercase tracking-widest text-muted-foreground">Business Expense and Receipt Tracker</p>
          <p className="mt-16 max-w-xl text-lg text-muted-foreground">
            AI-powered invoice management for production budgets. Vendors email in. Bert handles the rest.
          </p>
          <div className="mt-10">
            <Button size="lg" onClick={handleTryDemo}>
              Try the demo <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>

        {/* How it works */}
        <section className="border-t bg-muted/40">
          <div className="container py-20">
            <h2 className="text-center text-2xl font-bold tracking-tight">How it works</h2>
            <div className="mt-12 grid gap-8 md:grid-cols-3">
              {steps.map((step) => (
                <div key={step.number} className="flex flex-col items-center text-center">
                  <span className="text-5xl font-extrabold text-primary/20">{step.number}</span>
                  <h3 className="mt-3 font-semibold">{step.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="container py-20">
          <h2 className="text-center text-2xl font-bold tracking-tight">Everything you need</h2>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {features.map((f) => (
              <Card key={f.title}>
                <CardContent className="pt-6">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-secondary">
                    {f.icon}
                  </div>
                  <h3 className="mt-4 font-semibold">{f.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{f.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        {/* CTA */}
        <section className="border-t bg-muted/40">
          <div className="container flex flex-col items-center py-20 text-center">
            <h2 className="text-2xl font-bold tracking-tight">See it in action</h2>
            <p className="mt-3 text-muted-foreground">
              Explore a live dashboard with real projects and invoices — no sign-up needed.
            </p>
            <Button size="lg" className="mt-8" onClick={handleTryDemo}>
              Open demo <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© Bert. 2026</p>
      </footer>

      <LandingChat />
    </div>
  );
};

export default Landing;
