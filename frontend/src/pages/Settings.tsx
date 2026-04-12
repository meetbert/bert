import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { UserSettings } from '@/types/database';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { ArrowRight, Copy, LogOut, Mail, Sparkles } from 'lucide-react';
import { SUPPORTED_CURRENCIES } from '@/lib/currency';
import { useWalkthrough } from '@/contexts/WalkthroughContext';
import { useDemoData } from '@/contexts/DemoDataContext';

const Settings = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { start: startWalkthrough } = useWalkthrough();
  const { isDemoMode } = useDemoData();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const [inboxAddress, setInboxAddress] = useState<string | null>(null);
  const [baseCurrency, setBaseCurrency] = useState('EUR');

  useEffect(() => {
    if (!user) { setLoading(false); return; }

    supabase
      .from('user_settings')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (data) {
          setSettings(data as any);
          setBaseCurrency(data.base_currency ?? 'EUR');
          setInboxAddress(data.agentmail_inbox ?? null);
        }
        setLoading(false);
      });
  }, [user]);

  const copyInbox = () => {
    if (!inboxAddress) return;
    navigator.clipboard.writeText(inboxAddress);
    toast({ title: 'Copied', description: inboxAddress });
  };

  if (loading) return (
    <div className="min-h-screen">
      <div className="container max-w-2xl space-y-6 py-8">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-40 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
        <Skeleton className="h-32 rounded-lg" />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      <div className="container max-w-2xl space-y-6 py-8">
        <h1 className="text-2xl font-bold tracking-[-0.03em]">Settings</h1>

        {/* ── Invoice Inbox ─────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Invoice Inbox</h3>
              <p className="text-xs text-muted-foreground mt-1">
                {inboxAddress
                  ? 'Share this with vendors — invoices land directly in your dashboard.'
                  : 'No inbox assigned yet. Book a call and we\'ll set one up for you.'}
              </p>
            </div>
            {inboxAddress ? (
              <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="flex-1 font-mono text-sm">{inboxAddress}</span>
                <button onClick={copyInbox} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Copy">
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <div>
                <a
                  href="https://calendly.com/meetbert-info/30min"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button size="sm" className="bg-[#FF4242] text-white hover:bg-[#FF4242]/90">
                    <ArrowRight className="mr-1 h-4 w-4" /> Get Started
                  </Button>
                </a>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Currency ────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Base Currency</h3>
              <p className="text-xs text-muted-foreground mt-1">All dashboard totals and KPIs will display in this currency.</p>
            </div>
            <Select value={baseCurrency} onValueChange={async (v) => {
              setBaseCurrency(v);
              if (!user) return;
              const { error } = await supabase.from('user_settings').upsert({ id: user.id, base_currency: v });
              if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
              toast({ title: 'Currency updated' });
            }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {SUPPORTED_CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* ── Tour ──────────────────────────────────────────────────── */}
        <Card>
          <CardContent className="pt-6 space-y-3">
            <div>
              <h3 className="text-sm font-semibold">Product Tour</h3>
              <p className="text-xs text-muted-foreground mt-1">Take a guided walkthrough of Bert's features.</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                localStorage.removeItem('bert_walkthrough_done');
                startWalkthrough();
                navigate('/dashboard');
              }}
            >
              <Sparkles className="mr-1 h-4 w-4" /> Show me around
            </Button>
          </CardContent>
        </Card>

        {/* ── Account (hidden in demo) ─────────────────────────────── */}
        {!isDemoMode && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Account</h3>
                <p className="text-xs text-muted-foreground mt-1">{user?.email}</p>
              </div>
              <Button variant="outline" size="sm" onClick={signOut}><LogOut className="mr-1 h-4 w-4" /> Logout</Button>
            </CardContent>
          </Card>
        )}

        {/* ── Exit demo ───────────────────────────────────────────────── */}
        {isDemoMode && (
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div>
                <h3 className="text-sm font-semibold">Demo Mode</h3>
                <p className="text-xs text-muted-foreground mt-1">Return to the landing page and exit the demo.</p>
              </div>
              <Button variant="outline" size="sm" onClick={() => navigate('/')}>
                <LogOut className="mr-1 h-4 w-4" /> Exit demo
              </Button>
            </CardContent>
          </Card>
        )}

      </div>
    </div>
  );
};

export default Settings;
