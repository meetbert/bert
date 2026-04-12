import { useState, useEffect } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { resolvePostAuthRoute } from '@/lib/authRouting';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft } from 'lucide-react';

const Login = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [isSignUp, setIsSignUp] = useState(searchParams.get('signup') === 'true');
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;

    supabase
      .from('user_settings')
      .select('onboarding_done')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        navigate(resolvePostAuthRoute(user, data), { replace: true });
      });
  }, [user, navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        // Supabase returns a user with an empty identities array when the email is already registered
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          toast({ title: 'Account already exists', description: 'An account with this email already exists. Please sign in instead.', variant: 'destructive' });
        } else {
          toast({ title: 'Check your email', description: 'We sent a confirmation link.' });
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) throw error;
      toast({ title: 'Check your email', description: 'We sent a password reset link.' });
      setIsForgotPassword(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${window.location.origin}/dashboard` } });
    if (error) toast({ title: 'Error', description: error.message, variant: 'destructive' });
  };

  return (
    <div className="min-h-screen">
      <div className="container pt-6">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/"><ArrowLeft className="mr-2 h-4 w-4" />Back</Link>
        </Button>
      </div>
      <div className="container flex items-center justify-center py-12">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-primary">Bert.</CardTitle>
            <CardDescription>
              {isForgotPassword ? 'Reset your password' : isSignUp ? 'Create your account' : 'Sign in to your account'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isForgotPassword ? (
              <>
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Sending...' : 'Send reset link'}
                  </Button>
                </form>
                <p className="mt-4 text-center text-sm text-muted-foreground">
                  <button className="font-medium text-primary hover:underline" onClick={() => setIsForgotPassword(false)}>
                    Back to sign in
                  </button>
                </p>
              </>
            ) : (
              <>
                <form onSubmit={handleAuth} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      {!isSignUp && (
                        <button type="button" className="text-xs text-muted-foreground hover:text-primary hover:underline" onClick={() => setIsForgotPassword(true)}>
                          Forgot password?
                        </button>
                      )}
                    </div>
                    <Input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Loading...' : isSignUp ? 'Sign Up' : 'Sign In'}
                  </Button>
                </form>

                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center"><span className="w-full border-t" /></div>
                  <div className="relative flex justify-center text-xs uppercase"><span className="bg-card px-2 text-muted-foreground">or</span></div>
                </div>

                <Button variant="outline" className="w-full" onClick={handleGoogleLogin}>
                  Continue with Google
                </Button>

                <p className="mt-4 text-center text-sm text-muted-foreground">
                  {isSignUp ? 'Already have an account?' : "Don't have an account?"}{' '}
                  <button className="font-medium text-primary hover:underline" onClick={() => setIsSignUp(!isSignUp)}>
                    {isSignUp ? 'Sign in' : 'Sign up'}
                  </button>
                </p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Login;
