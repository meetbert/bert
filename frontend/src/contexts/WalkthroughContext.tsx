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
    target: 'kpi-row',
    title: 'Your KPI Overview',
    description: 'See active projects, outstanding invoices, overdue payments, and what\'s due this week — all at a glance.',
    route: '/dashboard',
  },
  {
    target: 'monthly-spend',
    title: 'Monthly Spend Chart',
    description: 'Track spending over time across all your productions. Use the dropdown to switch between 3, 6, or 12 month views.',
    route: '/dashboard',
  },
  {
    target: 'project-budgets',
    title: 'Project Budgets',
    description: 'Monitor budget utilisation per project. If spending exceeds the budget, the project will be flagged as over budget.',
    route: '/dashboard',
  },
  {
    target: 'add-project-btn',
    title: 'Create Projects',
    description: 'Create a project for each production to track invoices and budgets.',
    route: '/projects',
  },
  {
    target: 'invoices-table',
    title: 'Invoice Management',
    description: 'Assign invoices to projects and categories directly in the table. You can filter, search, and manage all invoices here.',
    route: '/invoices',
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
