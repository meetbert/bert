import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';

interface DemoDataContextType {
  isDemoMode: boolean;
  startDemo: () => Promise<void>;
  stopDemo: () => Promise<void>;
}

const DemoDataContext = createContext<DemoDataContextType | null>(null);

export const useDemoData = () => {
  const ctx = useContext(DemoDataContext);
  if (!ctx) throw new Error('useDemoData must be used within DemoDataProvider');
  return ctx;
};

const SS_FLAG = 'bert_demo';
const DEMO_EMAIL = 'demo@meetbert.uk';
const DEMO_PASSWORD = '!ImperialAIV26!';

export const DemoDataProvider = ({ children }: { children: React.ReactNode }) => {
  const [isDemoMode, setIsDemoMode] = useState(() => sessionStorage.getItem(SS_FLAG) === '1');

  const startDemo = useCallback(async () => {
    await supabase.auth.signInWithPassword({ email: DEMO_EMAIL, password: DEMO_PASSWORD });
    sessionStorage.setItem(SS_FLAG, '1');
    setIsDemoMode(true);
  }, []);

  const stopDemo = useCallback(async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem(SS_FLAG);
    setIsDemoMode(false);
  }, []);

  const value = useMemo(() => ({ isDemoMode, startDemo, stopDemo }), [isDemoMode, startDemo, stopDemo]);

  return (
    <DemoDataContext.Provider value={value}>
      {children}
    </DemoDataContext.Provider>
  );
};
