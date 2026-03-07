import { User } from '@supabase/supabase-js';

type UserSettingsPreview = {
  onboarding_done: boolean;
} | null;

const FIRST_SIGN_IN_WINDOW_MS = 2 * 60 * 1000;

function isGoogleUser(user: User) {
  if (user.app_metadata?.provider === 'google') return true;

  if (Array.isArray(user.app_metadata?.providers) && user.app_metadata.providers.includes('google')) {
    return true;
  }

  return (user.identities ?? []).some((identity) => identity.provider === 'google');
}

function isFirstSignIn(user: User) {
  const createdAt = Date.parse(user.created_at);
  const lastSignInAt = Date.parse(user.last_sign_in_at ?? '');

  if (!Number.isFinite(createdAt) || !Number.isFinite(lastSignInAt)) return false;

  return Math.abs(lastSignInAt - createdAt) <= FIRST_SIGN_IN_WINDOW_MS;
}

export function resolvePostAuthRoute(user: User, settings: UserSettingsPreview) {
  if (settings?.onboarding_done) return '/dashboard';

  if (isGoogleUser(user) && !isFirstSignIn(user)) {
    return '/dashboard';
  }

  return '/onboarding';
}
