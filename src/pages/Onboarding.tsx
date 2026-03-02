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
import { Check, ExternalLink, ChevronDown, ChevronUp } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const totalSteps = 4;

  // Step 2 state
  const [emailProvider, setEmailProvider] = useState<string>('gmail');
  const [emailAddress, setEmailAddress] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState('');
  const [imapPassword, setImapPassword] = useState('');
  const [emailSaved, setEmailSaved] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  // Step 3 state
  const [projectName, setProjectName] = useState('');
  const [projectBudget, setProjectBudget] = useState('');
  const [projectStatus, setProjectStatus] = useState<'Active' | 'Completed'>('Active');
  const [projectAdded, setProjectAdded] = useState(false);

  const saveEmailSettings = async () => {
    if (!user) return;
    const { error } = await supabase.from('user_settings').upsert({
      id: user.id,
      email_address: emailAddress,
      email_provider: emailProvider,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    } else {
      setEmailSaved(true);
      toast({ title: '✓ Saved', description: 'Inbox settings saved.' });
    }
  };

  const addProject = async () => {
    if (!projectName.trim()) return;
    const { error } = await supabase.from('projects').insert({
      name: projectName.trim(),
      budget: projectBudget ? parseFloat(projectBudget) : 0,
      status: projectStatus,
    });
    if (error) {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
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

        {step === 1 && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold text-primary">Welcome to Bert.</CardTitle>
              <CardDescription>Let's set up your workspace in 3 steps.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => setStep(2)}>Let's go →</Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Connect Your Inbox</CardTitle>
              <CardDescription>Bert. monitors an email inbox for invoice attachments. Choose how you'd like to connect:</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <RadioGroup value={emailProvider} onValueChange={setEmailProvider} className="flex gap-4">
                {['gmail', 'outlook', 'other'].map((p) => (
                  <div key={p} className="flex items-center gap-2">
                    <RadioGroupItem value={p} id={p} />
                    <Label htmlFor={p} className="capitalize">{p === 'other' ? 'Other (IMAP)' : p}</Label>
                  </div>
                ))}
              </RadioGroup>

              {emailProvider === 'gmail' && (
                <div className="space-y-3 rounded-lg border bg-secondary/30 p-4 text-sm">
                  <p className="font-medium">Gmail uses OAuth2 — no password needed.</p>
                  <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                    <li>Enter your Gmail address below and save</li>
                    <li>The backend admin needs to complete the one-time authorisation at{' '}
                      <a
                        href="http://localhost:8000/api/auth/gmail/authorize"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-0.5 text-primary hover:underline"
                      >
                        /api/auth/gmail/authorize <ExternalLink className="h-3 w-3" />
                      </a>
                    </li>
                  </ol>
                </div>
              )}

              {emailProvider === 'outlook' && (
                <div className="space-y-3 rounded-lg border p-4 text-sm">
                  <ol className="list-inside list-decimal space-y-1 text-muted-foreground">
                    <li>Use an Outlook/Microsoft 365 inbox dedicated to invoices</li>
                    <li>Enable IMAP in Outlook settings</li>
                    <li>Paste credentials below</li>
                  </ol>
                </div>
              )}

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Email address</Label>
                  <Input value={emailAddress} onChange={(e) => setEmailAddress(e.target.value)} placeholder="invoices@yourdomain.com" />
                </div>
                {emailProvider !== 'gmail' && (
                  <>
                    <div className="space-y-2">
                      <Label>Password</Label>
                      <Input type="password" value={imapPassword} onChange={(e) => setImapPassword(e.target.value)} placeholder="••••••••" />
                    </div>
                    {emailProvider === 'other' && (
                      <>
                        <div className="space-y-2">
                          <Label>IMAP Host</Label>
                          <Input value={imapHost} onChange={(e) => setImapHost(e.target.value)} placeholder="imap.example.com" />
                        </div>
                        <div className="space-y-2">
                          <Label>IMAP Port</Label>
                          <Input value={imapPort} onChange={(e) => setImapPort(e.target.value)} placeholder="993" />
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>

              <div className="flex items-center gap-3">
                <Button onClick={saveEmailSettings} disabled={!emailAddress}>Save & Continue →</Button>
                {emailSaved && <Check className="h-5 w-5 text-success" />}
              </div>

              {/* Help collapsible */}
              <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => setHelpOpen(!helpOpen)}>
                {helpOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                What if I don't have a dedicated email yet?
              </button>
              {helpOpen && (
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  <p>We recommend creating a free Gmail account like <strong>bert-invoices-yourname@gmail.com</strong> and forwarding invoices there.</p>
                  <a href="https://accounts.google.com/signup" target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-primary hover:underline">
                    Create a Gmail account →
                  </a>
                </div>
              )}

              <div className="flex justify-end">
                <Button variant="ghost" onClick={() => setStep(3)}>Skip →</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Create Your First Project</CardTitle>
              <CardDescription>A project groups invoices by production. Add a name and optional budget.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Project Name</Label>
                <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="My First Production" required />
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
              {projectAdded && <p className="text-sm text-success">✓ Project added</p>}
              <div className="flex justify-between pt-4">
                <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep(4)}>Skip for now</button>
                {projectAdded && <Button onClick={() => setStep(4)}>Continue →</Button>}
              </div>
            </CardContent>
          </Card>
        )}

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
