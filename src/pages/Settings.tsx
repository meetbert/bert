import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { UserSettings, Category } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { Copy, ExternalLink, Plus, LogOut, Pencil, Trash2, CheckCircle2, Mail } from 'lucide-react';
import { SUPPORTED_CURRENCIES, currencySymbol } from '@/lib/currency';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

const Settings = () => {
  const { user, session, signOut } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Meetbert.uk inbox
  const [inboxAddress, setInboxAddress] = useState<string | null>(null);
  const [inboxActive, setInboxActive] = useState(false);
  const [creatingInbox, setCreatingInbox] = useState(false);
  const [disconnectingInbox, setDisconnectingInbox] = useState(false);

  // Gmail OAuth
  const [gmailConnected, setGmailConnected] = useState(false);
  const [gmailEmail, setGmailEmail] = useState<string | null>(null);
  const [disconnectingGmail, setDisconnectingGmail] = useState(false);

  // Category form
  const [newCategory, setNewCategory] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);

  // Currency
  const [baseCurrency, setBaseCurrency] = useState('EUR');

  /** Authenticated fetch to the FastAPI backend. */
  const apiFetch = (path: string, options: RequestInit = {}) => {
    const token = session?.access_token;
    return fetch(`${BACKEND}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  };

  useEffect(() => {
    if (!user) return;

    // Detect ?gmail_connected=true redirect from OAuth
    const params = new URLSearchParams(window.location.search);
    if (params.get('gmail_connected') === 'true') {
      toast({ title: 'Gmail connected', description: 'Your Gmail account is now linked.' });
      window.history.replaceState({}, '', '/settings');
    }

    // Supabase queries — must complete before rendering
    Promise.all([
      supabase.from('user_settings').select('*').eq('id', user.id).single(),
      supabase.from('invoice_categories').select('*').order('name'),
      supabase.from('user_gmail_tokens').select('gmail_email').eq('user_id', user.id).maybeSingle(),
    ]).then(([s, c, g]) => {
      if (s.data) {
        setSettings(s.data as any);
        setBaseCurrency(s.data.base_currency ?? 'EUR');
      }
      setCategories(c.data ?? []);
      setGmailConnected(!!g.data);
      setGmailEmail(g.data?.gmail_email ?? null);
      setLoading(false);
    });

    // Backend inbox fetch — independent, failure must not block the page
    apiFetch('/api/inbox')
      .then(async (resp) => {
        if (resp.ok) {
          const data = await resp.json();
          setInboxAddress(data?.address ?? null);
          setInboxActive(data?.active ?? false);
        }
      })
      .catch(() => { /* backend unavailable — inbox section stays in "not created" state */ });
  }, [user]);

  const createInbox = async () => {
    setCreatingInbox(true);
    try {
      const resp = await apiFetch('/api/inbox', { method: 'POST' });
      const data = await resp.json();
      if (!resp.ok) {
        toast({ title: 'Error', description: data.detail ?? 'Could not create inbox.', variant: 'destructive' });
        return;
      }
      setInboxAddress(data.address);
      setInboxActive(true);
      if (data.is_new) {
        toast({ title: 'Inbox created!', description: `Your address is ${data.address}` });
      }
    } catch {
      toast({ title: 'Error', description: 'Could not reach server.', variant: 'destructive' });
    } finally {
      setCreatingInbox(false);
    }
  };

  const disconnectInbox = async () => {
    setDisconnectingInbox(true);
    try {
      const resp = await apiFetch('/api/inbox', { method: 'DELETE' });
      if (resp.ok) {
        setInboxActive(false);
        toast({ title: 'Inbox disconnected' });
      } else {
        toast({ title: 'Error', description: 'Could not disconnect inbox.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Could not reach server.', variant: 'destructive' });
    } finally {
      setDisconnectingInbox(false);
    }
  };

  const disconnectGmail = async () => {
    setDisconnectingGmail(true);
    try {
      const resp = await apiFetch('/api/auth/gmail', { method: 'DELETE' });
      if (resp.ok) {
        setGmailConnected(false);
        setGmailEmail(null);
        toast({ title: 'Gmail disconnected' });
      } else {
        toast({ title: 'Error', description: 'Could not disconnect Gmail.', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Error', description: 'Could not reach server.', variant: 'destructive' });
    } finally {
      setDisconnectingGmail(false);
    }
  };

  const copyInbox = () => {
    if (!inboxAddress) return;
    navigator.clipboard.writeText(inboxAddress);
    toast({ title: 'Copied', description: inboxAddress });
  };

  const refreshCategories = async () => {
    const { data } = await supabase.from('invoice_categories').select('*').order('name');
    setCategories(data ?? []);
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const { error } = await supabase.from('invoice_categories').insert({ name: newCategory.trim() });
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setNewCategory('');
    refreshCategories();
    toast({ title: 'Category added' });
  };

  const renameCategory = async () => {
    if (!editingCategoryId || !editingCategoryName.trim()) return;
    const { error } = await supabase.from('invoice_categories').update({ name: editingCategoryName.trim() }).eq('id', editingCategoryId);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setEditingCategoryId(null);
    setEditingCategoryName('');
    refreshCategories();
    toast({ title: 'Category renamed' });
  };

  const deleteCategory = async () => {
    if (!deleteCategoryId) return;
    const { error } = await supabase.from('invoice_categories').delete().eq('id', deleteCategoryId);
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setDeleteCategoryId(null);
    refreshCategories();
    toast({ title: 'Category deleted' });
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

        {/* ── Connect Inbox (merged primary + optional Gmail) ─────────── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Connect Inbox</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">

            {/* Option 1 — Dedicated @meetbert.uk inbox */}
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Dedicated inbox</p>
              {inboxAddress && inboxActive ? (
                <>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Connected
                  </div>
                  <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 px-3 py-2">
                    <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="flex-1 font-mono text-sm">{inboxAddress}</span>
                    <button onClick={copyInbox} className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground" title="Copy">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">Share this with vendors — invoices land directly in your dashboard.</p>
                  <Button size="sm" variant="outline" onClick={disconnectInbox} disabled={disconnectingInbox}>
                    {disconnectingInbox ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                </>
              ) : gmailConnected ? (
                <p className="text-xs text-muted-foreground">
                  Disconnect Gmail below to use a dedicated inbox instead.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Get a <strong>@meetbert.uk</strong> address. Give it to vendors — no Gmail connection needed.
                  </p>
                  {inboxAddress ? (
                    // Previously had one, reactivate it
                    <Button size="sm" onClick={createInbox} disabled={creatingInbox}>
                      {creatingInbox ? 'Reconnecting…' : `Reconnect ${inboxAddress}`}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={createInbox} disabled={creatingInbox}>
                      {creatingInbox ? 'Creating…' : 'Create my invoice inbox'}
                    </Button>
                  )}
                </>
              )}
            </div>

            <div className="border-t" />

            {/* Option 2 — Gmail (secondary) */}
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Gmail <span className="normal-case font-normal">(alternative)</span>
              </p>
              {gmailConnected ? (
                <>
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    Connected{gmailEmail ? ` as ${gmailEmail}` : ' via OAuth2'}
                  </div>
                  <Button size="sm" variant="outline" onClick={disconnectGmail} disabled={disconnectingGmail}>
                    {disconnectingGmail ? 'Disconnecting…' : 'Disconnect'}
                  </Button>
                </>
              ) : inboxActive ? (
                <p className="text-xs text-muted-foreground">
                  Disconnect your @meetbert.uk inbox above to connect Gmail instead.
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    Connect your personal Gmail so Bert can scan your inbox for invoice emails.
                  </p>
                  <a
                    href={`${BACKEND}/api/auth/gmail/authorize?user_id=${user?.id}`}
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Connect Gmail <ExternalLink className="h-3 w-3" />
                  </a>
                </>
              )}
            </div>

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

        {/* ── Project Management ──────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Project Management</CardTitle></CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects')}>Manage Projects →</Button>
          </CardContent>
        </Card>

        {/* ── Categories ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Categories</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {categories.map((c) => (
                <div key={c.id} className="flex items-center justify-between rounded-lg border px-3 py-2">
                  {editingCategoryId === c.id ? (
                    <div className="flex flex-1 items-center gap-2">
                      <Input
                        value={editingCategoryName}
                        onChange={(e) => setEditingCategoryName(e.target.value)}
                        className="h-7 text-sm"
                        autoFocus
                        onKeyDown={(e) => e.key === 'Enter' && renameCategory()}
                      />
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={renameCategory}>Save</Button>
                      <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setEditingCategoryId(null)}>Cancel</Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-sm">{c.name}</span>
                      <div className="flex gap-1">
                        <button
                          onClick={() => { setEditingCategoryId(c.id); setEditingCategoryName(c.name); }}
                          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setDeleteCategoryId(c.id)}
                          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" className="max-w-xs" onKeyDown={(e) => e.key === 'Enter' && addCategory()} />
              <Button size="sm" variant="outline" onClick={addCategory}><Plus className="mr-1 h-3.5 w-3.5" /> Add</Button>
            </div>
          </CardContent>
        </Card>

        {/* ── Onboarding ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Onboarding</CardTitle></CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => navigate('/onboarding')}>Re-run Onboarding</Button>
          </CardContent>
        </Card>

        {/* ── Account ─────────────────────────────────────────────────── */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Account</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <Button variant="outline" size="sm" onClick={signOut}><LogOut className="mr-1 h-4 w-4" /> Logout</Button>
          </CardContent>
        </Card>

        {/* ── Delete category confirmation ─────────────────────────────── */}
        <Dialog open={!!deleteCategoryId} onOpenChange={() => setDeleteCategoryId(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Delete category?</DialogTitle></DialogHeader>
            <p className="text-sm text-muted-foreground">This will remove the category. Invoices using it will become uncategorized.</p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteCategoryId(null)}>Cancel</Button>
              <Button variant="destructive" onClick={deleteCategory}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
};

export default Settings;
