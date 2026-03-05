import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { UserSettings } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Copy, LogOut, Mail, Sparkles, Trash2 } from 'lucide-react';
import { SUPPORTED_CURRENCIES, currencySymbol } from '@/lib/currency';
import { useWalkthrough } from '@/contexts/WalkthroughContext';
import { useDemoData } from '@/contexts/DemoDataContext';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
const Settings = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { start: startWalkthrough } = useWalkthrough();
  const { startDemo } = useDemoData();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Meetbert.uk inbox (read-only — assigned manually by admin)
  const [inboxAddress, setInboxAddress] = useState<string | null>(null);

  // Currency
  const [baseCurrency, setBaseCurrency] = useState('EUR');

  useEffect(() => {
    if (!user) return;

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
      <Navbar />
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
      <Navbar />
      <div className="container max-w-2xl space-y-6 py-8">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* ── Invoice Inbox ─────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Invoice Inbox</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {inboxAddress ? (
              <>
                <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 px-3 py-2">
                  <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="flex-1 font-mono text-sm">{inboxAddress}</span>
                  <button onClick={copyInbox} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Copy">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">Share this with vendors — invoices land directly in your dashboard.</p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                No inbox assigned yet. Contact your administrator to get set up.
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Currency ────────────────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Base Currency</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">All dashboard totals and KPIs will display in this currency.</p>
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
                  <SelectItem key={c} value={c}>{currencySymbol(c).trim()} {c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* ── Tour ──────────────────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Product Tour</CardTitle></CardHeader>
          <CardContent>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                localStorage.removeItem('bert_walkthrough_done');
                startDemo();
                startWalkthrough();
                navigate('/dashboard');
              }}
            >
              <Sparkles className="mr-1 h-4 w-4" /> Show me around
            </Button>
          </CardContent>
        </Card>

        {/* ── Account ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Account</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={signOut}><LogOut className="mr-1 h-4 w-4" /> Logout</Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Delete Account
              </Button>
            </div>
          </CardContent>
        </Card>

        <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete your account?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete your account and all associated data including invoices, projects, and settings. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                disabled={deleting}
                onClick={async (e) => {
                  e.preventDefault();
                  setDeleting(true);
                  try {
                    const { data: { session: s } } = await supabase.auth.getSession();
                    const res = await supabase.functions.invoke('delete-account', {
                      headers: { Authorization: `Bearer ${s?.access_token}` },
                    });
                    if (res.error || res.data?.error) {
                      throw new Error(res.data?.error || res.error?.message || 'Failed');
                    }
                    await supabase.auth.signOut();
                    navigate('/');
                    toast({ title: 'Account deleted' });
                  } catch (err: any) {
                    toast({ title: 'Error', description: err.message, variant: 'destructive' });
                  } finally {
                    setDeleting(false);
                    setDeleteOpen(false);
                  }
                }}
              >
                {deleting ? 'Deleting…' : 'Yes, delete my account'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

      </div>
    </div>
  );
};

export default Settings;
