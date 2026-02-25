import { createClient } from '@supabase/supabase-js';

type EnvMap = Record<string, string | undefined>;
const env = import.meta.env as EnvMap;

const pickEnv = (...keys: string[]) => keys.map((key) => env[key]?.trim()).find(Boolean) ?? '';

const supabaseUrl = pickEnv('VITE_SUPABASE_URL', 'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL');
const supabaseAnonKey = pickEnv('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY');

const isValidSupabaseUrl = /^https:\/\/[a-zA-Z0-9-]+\.supabase\.co$/i.test(supabaseUrl);
const isValidAnonKey = supabaseAnonKey.length > 20;

const hasSupabaseConfig = Boolean(isValidSupabaseUrl && isValidAnonKey);

if (!hasSupabaseConfig) {
  console.warn('Supabase is not configured correctly. Add valid URL/key in project secrets.');
}

export const supabase = createClient(
  hasSupabaseConfig ? supabaseUrl : 'https://placeholder.supabase.co',
  hasSupabaseConfig ? supabaseAnonKey : 'placeholder-key'
);

export { hasSupabaseConfig };
