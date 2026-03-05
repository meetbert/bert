import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';

export interface TourStep {
  target: string;       // data-tour attribute value
  title: string;
  description: string;
  route: string;        // page the element lives on
}

const TOUR_STEPS: TourStep[] = [
  {
    target: 'kpi-row',
    title: 'Your KPI Overview',
    description: 'See active projects, outstanding invoices, overdue amounts, and what\'s due this week — all at a glance.',
    route: '/dashboard',
  },
  {
    target: 'monthly-spend',
    title: 'Monthly Spend Chart',
    description: 'Track your spending over time. Use the dropdown to switch between 3, 6, or 12 month views.',
    route: '/dashboard',
  },
  {
    target: 'project-budgets',
    title: 'Project Budgets',
    description: 'Monitor budget utilisation per project with category breakdowns. Red means over budget.',
    route: '/dashboard',
  },
  {
    target: 'projects-list',
    title: 'Your Projects',
    description: 'Manage all your projects here. Create new ones, filter by status, and track budgets.',
    route: '/projects',
  },
  {
    target: 'invoices-table',
    title: 'Invoice Management',
    description: 'View, filter, and manage all invoices. Assign projects and categories inline by hovering on a row.',
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

  const step = isActive ? TOUR_STEPS[currentStep] ?? null : null;

  const goToStep = useCallback((idx: number) => {
    if (idx < 0 || idx >= TOUR_STEPS.length) {
      setIsActive(false);
      localStorage.setItem('bert_walkthrough_done', 'true');
      return;
    }
    setCurrentStep(idx);
    const target = TOUR_STEPS[idx];
    if (target && location.pathname !== target.route) {
      navigate(target.route);
    }
  }, [navigate, location.pathname]);

  const next = useCallback(() => goToStep(currentStep + 1), [currentStep, goToStep]);
  const prev = useCallback(() => goToStep(currentStep - 1), [currentStep, goToStep]);
  const skip = useCallback(() => {
    setIsActive(false);
    localStorage.setItem('bert_walkthrough_done', 'true');
  }, []);

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
