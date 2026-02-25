import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { UserSettings, Category } from '@/types/database';
import { Navbar } from '@/components/Navbar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from '@/hooks/use-toast';
import { Eye, EyeOff, Plus, LogOut } from 'lucide-react';
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
  const [appPassword, setAppPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Category form
  const [newCategory, setNewCategory] = useState('');
  // Currency
  const [baseCurrency, setBaseCurrency] = useState('EUR');

  useEffect(() => {
    if (!user) return;
    Promise.all([
      supabase.from('user_settings').select('*').eq('id', user.id).single(),
      supabase.from('categories').select('*').order('name'),
    ]).then(([s, c]) => {
      if (s.data) {
        setSettings(s.data);
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

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    const { error } = await supabase.from('categories').insert({ name: newCategory.trim() });
    if (error) return toast({ title: 'Error', description: error.message, variant: 'destructive' });
    setNewCategory('');
    const { data } = await supabase.from('categories').select('*').order('name');
    setCategories(data ?? []);
    toast({ title: 'Category added' });
  };

  if (loading) return <div className="min-h-screen"><Navbar /><div className="container py-8"><div className="h-40 animate-pulse rounded-lg bg-secondary" /></div></div>;

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container max-w-2xl space-y-6 py-8">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* Inbox */}
        <Card>
          <CardHeader><CardTitle className="text-sm">Inbox Settings</CardTitle></CardHeader>
          <CardContent className="space-y-4">
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
            <div className="space-y-2">
              <Label>App Password</Label>
              <div className="relative">
                <Input type={showPassword ? 'text' : 'password'} value={appPassword} onChange={(e) => setAppPassword(e.target.value)} />
                <button className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" onClick={() => setShowPassword(!showPassword)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
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
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <span key={c.id} className="rounded bg-secondary px-2 py-1 text-xs">{c.name}</span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input value={newCategory} onChange={(e) => setNewCategory(e.target.value)} placeholder="New category" className="max-w-xs" />
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
      </div>
    </div>
  );
};

export default Settings;
