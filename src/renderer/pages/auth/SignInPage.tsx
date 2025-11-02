import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/renderer/ui/card';
import { Link, useNavigate } from 'react-router-dom';
import { AuthLayout } from './AuthLayout';
import { Label } from '@/renderer/ui/label';
import { Eye, EyeOff, Loader2, Mail } from 'lucide-react';
import { Input } from '@/renderer/ui/input';
import { Lock } from 'lucide-react';
import { Separator } from '@/renderer/ui/separator';
import { toast } from 'sonner';
import { useAuth } from '@/renderer/hooks/useAuth';
import { useState } from 'react';
import { Button } from '@/renderer/ui/button';
import { FaGoogle } from 'react-icons/fa';

/**
 * Sign In Page
 * Route: /auth/signin
 */
export function SignInPage() {
  const navigate = useNavigate();

  const { signIn, signInWithGoogle, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email || !password) {
      toast.error('Please enter an email and password');
      return;
    }
    
    await signIn({ email, password }).then(() => {
      toast.success('Signed in successfully');
      setTimeout(() => {
        navigate('/');
      }, 700)
    }).catch((error) => {
      toast.error(error.message);
      console.log(error);
    });
  };

  const handleGoogleSignIn = async () => {
    await signInWithGoogle().then(() => {
      setTimeout(() => {
        navigate('/');
      }, 700)
    }).catch((error) => {
      toast.error(error.message);
      console.log(error);
    })
  };

  
  return (
   <AuthLayout>
     <Card className="shadow-xl">
        <CardHeader>
          <CardTitle>Welcome Back</CardTitle>
          <CardDescription>
            Sign in to your account to continue
          </CardDescription>
        </CardHeader>
        
        <CardContent className='space-y-4'>
           <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  className="pl-10"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link 
                  to="/auth/forgot-password" 
                  className="text-xs text-primary hover:text-primary/80 mb-2"
                >
                  Forgot Password?
                </Link>
              </div>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <Input
                  id="newPassword"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                  }}
                  disabled={loading}
                  className="pl-10 pr-10"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={loading || !email || !password}
            >
              {loading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                'Sign In'
              )}
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <Separator />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-white dark:bg-slate-950 px-2 text-slate-500">
                Or continue with
              </span>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="w-full"
            onClick={handleGoogleSignIn}
            disabled={loading}
          >
            <FaGoogle className="mr-2 h-4 w-4" />
            Sign in with Google
          </Button>
          
          {/* Sign Up Link */}
          <div className="mt-6 text-center">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Don't have an account?{' '}
              <Link 
                to="/auth/signup" 
                className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
              >
                Sign up
              </Link>
            </p>
          </div>
        </CardContent>
      </Card>
   </AuthLayout>
  );
}
