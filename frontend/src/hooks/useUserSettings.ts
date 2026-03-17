import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/contexts/AuthContext';
import { useDemoData } from '@/contexts/DemoDataContext';
import { UserSettings } from '@/types/database';

export function useUserSettings() {
  const { user } = useAuth();
  const { isDemoMode, demoCurrency } = useDemoData();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    supabase
      .from('user_settings')
      .select('*')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        setSettings(data);
        setLoading(false);
      });
  }, [user]);

  const baseCurrency = isDemoMode ? demoCurrency : (settings?.base_currency ?? 'EUR');

  return { settings, loading, baseCurrency };
}
