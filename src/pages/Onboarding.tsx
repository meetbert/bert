import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Navbar } from '@/components/Navbar';
import { Check } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { ProjectCreationWizard } from '@/components/ProjectCreationWizard';
import { useWalkthrough } from '@/contexts/WalkthroughContext';
import { useDemoData } from '@/contexts/DemoDataContext';

const Onboarding = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { start: startWalkthrough } = useWalkthrough();
  const { startDemo } = useDemoData();
  const [step, setStep] = useState(1);
  const totalSteps = 3;

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
        <Progress value={(step / totalSteps) * 100} className="mb-8" />

        {step === 1 && (
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-3xl font-bold text-primary">Welcome to Bert.</CardTitle>
              <CardDescription>Let's set up your workspace in 2 quick steps.</CardDescription>
            </CardHeader>
            <CardContent>
              <Button className="w-full" onClick={() => setStep(2)}>Let's go →</Button>
            </CardContent>
          </Card>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Create Your First Project</CardTitle>
              <CardDescription>Set up your project with categories and documents.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <ProjectCreationWizard onComplete={() => setStep(3)} showProgress={false} />
              <div className="pt-2">
                <button className="text-sm text-muted-foreground hover:text-foreground" onClick={() => setStep(3)}>
                  Skip for now
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
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
