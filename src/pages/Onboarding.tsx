import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Navbar } from '@/components/Navbar';
import { toast } from '@/hooks/use-toast';
import { Check, Copy, ExternalLink, Mail } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const BACKEND = import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8000';

const Onboarding = () => {
  const { user, session } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  // Step 2 — inbox
  const [inboxAddress, setInboxAddress] = useState<string | null>(null);
  const [creatingInbox, setCreatingInbox] = useState(false);

  // Step 3 — project
  const [projectName, setProjectName] = useState('');
  const [projectBudget, setProjectBudget] = useState('');
  const [projectStatus, setProjectStatus] = useState<'Active' | 'Completed'>('Active');
  const [projectAdded, setProjectAdded] = useState(false);

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
    } catch {
      toast({ title: 'Error', description: 'Could not reach server.', variant: 'destructive' });
    } finally {
      setCreatingInbox(false);
    }
  };

  const copyInbox = () => {
    if (!inboxAddress) return;
    navigator.clipboard.writeText(inboxAddress);
    toast({ title: 'Copied' });
  };

  const addProject = async () => {
    if (!user || !projectName.trim()) return;
    const resp = await apiFetch('/api/projects', {
      method: 'POST',
      body: JSON.stringify({
        name: projectName.trim(),
        budget: projectBudget ? parseFloat(projectBudget) : 0,
        status: projectStatus,
      }),
    });
    if (!resp.ok) {
      const data = await resp.json().catch(() => ({}));
      toast({ title: 'Error', description: data.detail ?? 'Could not add project.', variant: 'destructive' });
    } else {
      setProjectAdded(true);
      toast({ title: 'Project added', description: `"${projectName}" created.` });
    }
  };

  const finishOnboarding = async () => {
    if (!user) return;
    await supabase.from('user_settings').upsert({ id: user.id, onboarding_done: true });
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container max-w-lg py-12">
        <Progress value={(step / totalSteps) * 100} className="mb-8" />

        {/* ── Step 1: Welcome ─────────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold text-primary">Welcome to Bert.</CardTitle>
              <CardDescription>Let's set up your workspace in 3 quick steps.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => setStep(2)}>Let's go →</Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Invoice Inbox ────────────────────────────────────── */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Your Invoice Inbox</CardTitle>
              <CardDescription>
                Bert gives you a dedicated email address. Share it with vendors and
                invoices land straight in your dashboard — automatically.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {!inboxAddress ? (
                <>
                  <div className="space-y-3">
                    <div className="rounded-lg border bg-secondary/30 px-4 py-3 space-y-1">
                      <p className="text-xs text-muted-foreground">You'll get an address like</p>
                      <p className="font-mono text-sm">yourname@meetbert.uk</p>
                    </div>
                    <ul className="space-y-1.5 text-sm text-muted-foreground">
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        No Gmail password or app setup needed
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        Invoices auto-detected and imported the moment they arrive
                      </li>
                      <li className="flex items-start gap-2">
                        <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                        Share with as many vendors as you like
                      </li>
                    </ul>
                  </div>
                  <Button onClick={createInbox} disabled={creatingInbox}>
                    {creatingInbox ? 'Creating…' : 'Create my invoice inbox'}
                  </Button>
                </>
              ) : (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Check className="h-4 w-4 text-green-600" />
                      Inbox ready
                    </div>
                    <div className="flex items-center gap-2 rounded-lg border bg-secondary/30 px-3 py-3">
                      <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="flex-1 font-mono text-sm">{inboxAddress}</span>
                      <button
                        onClick={copyInbox}
                        className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
                        title="Copy"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Give this address to vendors. You can also find it anytime in Settings.
                    </p>
                  </div>
                  <Button onClick={() => setStep(3)}>Continue →</Button>
                </>
              )}

              {/* Optional Gmail — clearly secondary */}
              <div className="border-t pt-4 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Optional: prefer to use your own Gmail?</p>
                <a
                  href={`${BACKEND}/api/auth/gmail/authorize?user_id=${user?.id}`}
                  className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  Connect Gmail instead <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <div className="flex justify-end">
                <Button variant="ghost" size="sm" onClick={() => setStep(3)}>Skip for now →</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: First Project ────────────────────────────────────── */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Create Your First Project</CardTitle>
              <CardDescription>A project groups invoices by production. Add a name and optional budget.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="My First Production" />
              </div>
              <div className="space-y-2">
                <Label>Budget (optional)</Label>
                <Input type="number" value={projectBudget} onChange={(e) => setProjectBudget(e.target.value)} placeholder="50000" />
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <RadioGroup value={projectStatus} onValueChange={(v) => setProjectStatus(v as 'Active' | 'Completed')} className="flex gap-4">
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Active" id="active" />
                    <Label htmlFor="active">Active</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="Completed" id="completed" />
                    <Label htmlFor="completed">Completed</Label>
                  </div>
                </RadioGroup>
              </div>
              <Button onClick={addProject} disabled={!projectName.trim()}>Add Project</Button>
              {projectAdded && <p className="text-sm text-green-600">✓ Project added</p>}
              <div className="flex justify-between pt-4">
                <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep(4)}>
                  Skip for now
                </button>
                {projectAdded && <Button onClick={() => setStep(4)}>Continue →</Button>}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Done ─────────────────────────────────────────────── */}
        {step === 4 && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                <Check className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>You're all set</CardTitle>
              <CardDescription>Your workspace is configured. Time to manage some invoices.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={finishOnboarding}>Go to Dashboard →</Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default Onboarding;
