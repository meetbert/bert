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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { ExternalLink, Plus, LogOut, Pencil, Trash2, RefreshCw, Wifi, CheckCircle2 } from 'lucide-react';
import { SUPPORTED_CURRENCIES, currencySymbol } from '@/lib/currency';

const Settings = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Inbox form
  const [emailProvider, setEmailProvider] = useState('gmail');
  const [emailAddress, setEmailAddress] = useState('');
  const [testingConnection, setTestingConnection] = useState(false);

  // Category form
  const [newCategory, setNewCategory] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingCategoryName, setEditingCategoryName] = useState('');
  const [deleteCategoryId, setDeleteCategoryId] = useState<number | null>(null);

  // Currency
  const [baseCurrency, setBaseCurrency] = useState('EUR');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('user_settings').select('*').eq('id', user.id).single(),
      supabase.from('invoice_categories').select('*').order('name'),
    ]).then(([s, c]) => {
      if (s.data) {
        setSettings(s.data as any);
        setEmailAddress(s.data.email_address ?? '');
        setEmailProvider(s.data.email_provider ?? 'gmail');
        setBaseCurrency(s.data.base_currency ?? 'EUR');
      }
      setCategories(c.data ?? []);
      setLoading(false);
    });
  }, [user]);

  const saveInbox = async () => {
    if (!user) return;
    const { error } = await supabase.from('user_settings').upsert({ id: user.id, email_address: emailAddress, email_provider: emailProvider });
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    toast({ title: 'Saved' });
  };

  const testConnection = async () => {
    setTestingConnection(true);
    // Placeholder — would call an edge function
    await new Promise((r) => setTimeout(r, 1500));
    setTestingConnection(false);
    toast({ title: 'Connection test', description: 'Backend required: No test endpoint configured yet.' });
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

        {/* Inbox */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Inbox Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Last synced: —</p>
              <Button variant="outline" size="sm" onClick={testConnection} disabled={testingConnection}>
                {testingConnection ? <RefreshCw className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Wifi className="mr-1 h-3.5 w-3.5" />}
                Test Connection
              </Button>
            </div>
            <RadioGroup value={emailProvider} onValueChange={setEmailProvider} className="flex gap-4">
              {['gmail', 'outlook', 'other'].map((p) => (
                <div key={p} className="flex items-center gap-2">
                  <RadioGroupItem value={p} id={`s-${p}`} />
                  <Label htmlFor={`s-${p}`} className="capitalize">{p === 'other' ? 'Other (IMAP)' : p}</Label>
                </div>
              ))}
            </RadioGroup>
            <div className="space-y-2">
              <Label>Email address</Label>
              <Input value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} />
            </div>

            {emailProvider === 'gmail' ? (
              <div className="rounded-lg border bg-secondary/30 p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  Gmail connected via OAuth2
                </div>
                <p className="text-xs text-muted-foreground">
                  Gmail access is authorised at the server level using OAuth2 — no password needed.
                  If you need to re-authorise (e.g. after revoking access), use the link below.
                </p>
                <a
                  href="http://localhost:8000/api/auth/gmail/authorize"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline"
                >
                  Re-authorise Gmail access <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            ) : null}

            <Button size="sm" onClick={saveInbox}>Save</Button>
          </CardContent>
        </Card>

        {/* Currency */}
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

        <Card>
          <CardHeader><CardTitle className="text-sm">Project Management</CardTitle></CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => navigate('/projects')}>Manage Projects →</Button>
          </CardContent>
        </Card>

        {/* Categories */}
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

        {/* Re-run onboarding */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Onboarding</CardTitle></CardHeader>
          <CardContent>
            <Button variant="outline" size="sm" onClick={() => navigate('/onboarding')}>Re-run Onboarding</Button>
          </CardContent>
        </Card>

        {/* Account */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Account</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">{user?.email}</p>
            <Button variant="outline" size="sm" onClick={signOut}><LogOut className="mr-1 h-4 w-4" /> Logout</Button>
          </CardContent>
        </Card>

        {/* Delete category confirmation */}
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
