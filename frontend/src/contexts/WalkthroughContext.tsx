import { createContext, useContext, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoData } from '@/contexts/DemoDataContext';

export interface TourStep {
  target: string;       // data-tour attribute value
  title: string;
  description: string;
  route: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'tour-intro',
    title: 'How Bert works for you',
    description: 'Bert processes your invoices automatically. We set up a dedicated inbox for you — on WhatsApp, email, or any channel you prefer. Just send in your invoices and Bert extracts the data, chases missing information, and assigns everything to the right project and category. No setup needed on your end. This tour walks you through the typical dashboard you would have after Bert sorted and categorised your invoices.',
    route: '/projects',
  },
  {
    target: 'add-project-btn',
    title: 'Set up your projects',
    description: 'Start off by creating your projects — either here in the projects tab or by chatting with Bert. Bert will automatically sort and categorise all incoming invoices into the right project for you.',
    route: '/projects',
  },
  {
    target: 'invoices-table',
    title: 'Your invoices, sorted',
    description: 'Once your invoices flow in, Bert extracts the details, assigns them to projects and categories, and chases any missing information. You can review everything here, but most of the work is already done for you.',
    route: '/invoices',
  },
  {
    target: 'kpi-row',
    title: 'Everything at a glance',
    description: 'Active projects, outstanding invoices, overdue payments, and what\'s due this week. Bert keeps these numbers up to date as invoices come in — no manual tracking needed.',
    route: '/dashboard',
  },
  {
    target: 'monthly-spend',
    title: 'Spending over time',
    description: 'Track your spending across all your productions. Bert keeps this updated automatically as invoices are processed. Use the dropdown to switch between 3, 6, or 12 month views.',
    route: '/dashboard',
  },
  {
    target: 'project-budgets',
    title: 'Budget tracking',
    description: 'Monitor how much of each project\'s budget has been used. Bert updates these figures as it assigns invoices, so you\'ll know immediately if a project is running over budget.',
    route: '/dashboard',
  },
];

interface WalkthroughContextType {
  isActive: boolean;
  currentStep: number;
  totalSteps: number;
  step: TourStep | null;
  next: () => void;
  prev: () => void;
  skip: () => void;
  start: () => void;
}

const WalkthroughContext = createContext<WalkthroughContextType | null>(null);

export const useWalkthrough = () => {
  const ctx = useContext(WalkthroughContext);
  if (!ctx) throw new Error('useWalkthrough must be used within WalkthroughProvider');
  return ctx;
};

export const WalkthroughProvider = ({ children }: { children: React.ReactNode }) => {
  const [isActive, setIsActive] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { isDemoMode, stopDemo } = useDemoData();

  const step = isActive ? TOUR_STEPS[currentStep] ?? null : null;

  const endTour = useCallback(() => {
    setIsActive(false);
    localStorage.setItem('bert_walkthrough_done', 'true');
    // If a logged-in user was viewing the tour in demo mode, exit demo and return to their dashboard
    if (user && isDemoMode) {
      stopDemo();
      navigate('/dashboard', { replace: true });
    }
  }, [user, isDemoMode, stopDemo, navigate]);

  const goToStep = useCallback((idx: number) => {
    if (idx < 0 || idx >= TOUR_STEPS.length) {
      endTour();
      return;
    }
    setCurrentStep(idx);
    const target = TOUR_STEPS[idx];
    if (target && location.pathname !== target.route) {
      navigate(target.route);
    }
  }, [navigate, location.pathname, endTour]);

  const next = useCallback(() => goToStep(currentStep + 1), [currentStep, goToStep]);
  const prev = useCallback(() => goToStep(currentStep - 1), [currentStep, goToStep]);
  const skip = useCallback(() => endTour(), [endTour]);

  const start = useCallback(() => {
    setCurrentStep(0);
    setIsActive(true);
    const firstStep = TOUR_STEPS[0];
    if (firstStep && location.pathname !== firstStep.route) {
      navigate(firstStep.route);
    }
  }, [navigate, location.pathname]);

  return (
    <WalkthroughContext.Provider value={{ isActive, currentStep, totalSteps: TOUR_STEPS.length, step, next, prev, skip, start }}>
      {children}
    </WalkthroughContext.Provider>
  );
};
