import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Navbar } from '@/components/Navbar';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';
import { FileText, BarChart3, AlertTriangle } from 'lucide-react';

const features = [
  {
    icon: <FileText className="h-6 w-6 text-primary" />,
    text: 'AI reads and extracts invoice data from your inbox automatically',
  },
  {
    icon: <BarChart3 className="h-6 w-6 text-primary" />,
    text: 'Track budgets across multiple productions in real time',
  },
  {
    icon: <AlertTriangle className="h-6 w-6 text-primary" />,
    text: 'Flag overdue payments, categorise spend, stay on top of cashflow',
  },
];

const Landing = () => {
  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container flex flex-col items-center justify-center py-24 text-center">
        <h1 className="text-6xl font-extrabold tracking-tight text-primary sm:text-8xl">Bert.</h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Your AI-powered invoice assistant for production budgets. Forward an email. Bert handles the rest.
        </p>
        <div className="mt-10">
          <Button asChild size="lg">
            <Link to="/login">Get Started</Link>
          </Button>
        </div>

        <div className="mt-20 grid max-w-3xl gap-8 md:grid-cols-3">
          {features.map((f, i) => (
            <div key={i} className="flex flex-col items-center gap-3 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary">{f.icon}</div>
              <p className="text-sm text-muted-foreground">{f.text}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="border-t py-8 text-center text-sm text-muted-foreground">
        <p>© Bert. 2025</p>
        <div className="mt-2 flex justify-center gap-4">
          <a href="#" className="hover:text-foreground">Privacy</a>
          <a href="#" className="hover:text-foreground">Terms</a>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
