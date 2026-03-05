import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Navbar } from '@/components/Navbar';
import { ArrowLeft, Check, FileText, Table } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ProjectCreationWizard } from '@/components/ProjectCreationWizard';
import { ImportModal } from '@/components/ImportModal';
import { useWalkthrough } from '@/contexts/WalkthroughContext';
import { useDemoData } from '@/contexts/DemoDataContext';
import { SUPPORTED_CURRENCIES, currencySymbol } from '@/lib/currency';

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { start: startWalkthrough } = useWalkthrough();
  const { startDemo } = useDemoData();
  const [step, setStep] = useState(1);
  const [baseCurrency, setBaseCurrency] = useState('EUR');
  const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  // Progress: if a project was created, there are 5 steps; otherwise 4 (import step is skipped)
  const totalSteps = createdProjectId !== null ? 5 : 4;
  const displayStep = createdProjectId !== null ? step : step === 5 ? 4 : step;

  const finishOnboarding = async () => {
    if (!user) return;
    await supabase.from('user_settings').upsert({ id: user.id, onboarding_done: true });
    localStorage.removeItem('bert_walkthrough_done');
    startDemo();
    startWalkthrough();
    navigate('/dashboard', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="container max-w-lg py-12">
        <Progress value={(displayStep / totalSteps) * 100} className="mb-8" />

        {/* ── Step 1: Welcome ─────────────────────────────────────────── */}
        {step === 1 && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold text-primary">Welcome to Bert.</CardTitle>
              <CardDescription>Let's set up your workspace in a few quick steps.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => setStep(2)}>Let's go →</Button>
            </CardContent>
          </Card>
        )}

        {/* ── Step 2: Base Currency ────────────────────────────────────── */}
        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Choose Your Base Currency</CardTitle>
              <CardDescription>All dashboard totals, KPIs, and budgets will display in this currency.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Select value={baseCurrency} onValueChange={setBaseCurrency}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{currencySymbol(c).trim()} {c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                <Button variant="outline" size="icon" onClick={() => setStep(1)}><ArrowLeft className="h-4 w-4" /></Button>
                <Button className="w-full" onClick={async () => {
                  if (!user) return;
                  await supabase.from('user_settings').upsert({ id: user.id, base_currency: baseCurrency });
                  setStep(3);
                }}>Continue →</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 3: Create First Project ─────────────────────────────── */}
        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Create Your First Project</CardTitle>
              <CardDescription>Set up your project with categories and documents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProjectCreationWizard
                onComplete={(id) => { setCreatedProjectId(id); setStep(4); }}
                showProgress={false}
              />
              <div className="flex items-center justify-between pt-2">
                <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep(2)}>
                  <ArrowLeft className="h-3 w-3" /> Back
                </button>
                <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep(5)}>
                  Skip for now
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── Step 4: Import Invoices (only if project was created) ──────── */}
        {step === 4 && createdProjectId !== null && (
          <>
            <Card>
              <CardHeader>
                <CardTitle>Import Your Invoices</CardTitle>
                <CardDescription>
                  Upload PDFs or a CSV spreadsheet and Bert will extract the details automatically.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setImportOpen(true)}
                    className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50 hover:bg-secondary/40"
                  >
                    <FileText className="h-7 w-7 text-muted-foreground" />
                    <span className="text-sm font-medium">PDF / Image</span>
                    <span className="text-xs text-muted-foreground">Upload invoice files</span>
                  </button>
                  <button
                    onClick={() => setImportOpen(true)}
                    className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:border-primary/50 hover:bg-secondary/40"
                  >
                    <Table className="h-7 w-7 text-muted-foreground" />
                    <span className="text-sm font-medium">CSV / Spreadsheet</span>
                    <span className="text-xs text-muted-foreground">Import from Excel etc.</span>
                  </button>
                </div>
                <div className="flex items-center justify-between pt-2">
                  <button className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep(3)}>
                    <ArrowLeft className="h-3 w-3" /> Back
                  </button>
                  <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep(5)}>
                    Skip for now
                  </button>
                </div>
              </CardContent>
            </Card>
            <ImportModal
              open={importOpen}
              onClose={() => setImportOpen(false)}
              projectId={createdProjectId ?? undefined}
              onImported={() => { setImportOpen(false); setStep(5); }}
            />
          </>
        )}

        {/* ── Step 5: Done ─────────────────────────────────────────────── */}
        {step === 5 && (
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
