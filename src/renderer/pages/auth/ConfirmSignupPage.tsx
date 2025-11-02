import { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/renderer/ui/card';
import { Button } from '@/renderer/ui/button';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { AuthLayout } from './AuthLayout';
import { toast } from 'sonner';
import { FaRegFaceSadTear } from "react-icons/fa6";

type VerificationState = 'verifying' | 'success' | 'error';

export function ConfirmSignupPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [state, setState] = useState<VerificationState>('verifying');
  const [error, setError] = useState<string>('');

  useEffect(() => {
    verifyEmail();
  }, []);

  const verifyEmail = async () => {
    try {
      // Parse hash fragment for Supabase auth tokens
      const hash = location.hash.substring(1); // Remove leading #
      const params = new URLSearchParams(hash);
      
      // Check for error from Supabase
      const error = params.get('error');
      const errorDescription = params.get('error_description');
      
      if (error) {
        setState('error');
        setError(errorDescription || error);
        toast.error('Verification failed');
        return;
      }

      // Supabase sends session directly in URL hash (implicit flow)
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (!accessToken || !refreshToken) {
        setState('error');
        setError('Invalid verification link - missing tokens');
        return;
      }

      setState('success');
      toast.success('Email verified successfully!');
      
      // Wait a moment then redirect to app
      setTimeout(() => {
        navigate('/');
      }, 4000);
    } catch (err) {
      console.error('[ConfirmSignupPage] Error:', err);
      setState('error');
      setError('An unexpected error occurred');
      toast.error('Verification failed');
    }
  };

  const handleResend = async () => {
    // TODO: Implement resend confirmation email
    toast.info('Please check your email for a new confirmation link');
  };

  return (
    <AuthLayout>
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>Email Verification</CardTitle>
          <CardDescription>
            {state === 'verifying' && 'Verifying your email...'}
            {state === 'success' && 'Email verified successfully!'}
            {state === 'error' && 'Verification failed'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {state === 'verifying' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                Please wait while we verify your email...
              </p>
            </div>
          )}

          {state === 'success' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div className="text-center space-y-2">
                <p className="font-medium">Email verified!</p>
                <p className="text-sm text-muted-foreground">
                  Please Sign In with correct credentials to continue
                </p>
              </div>
            </div>
          )}

          {state === 'error' && (
            <div className="flex flex-col items-center justify-center py-8 space-y-6">
              <FaRegFaceSadTear className="h-12 w-12 text-destructive" />
              <div className="text-center space-y-2">
                <p className="font-medium text-destructive">Verification Failed</p>
                <p className="text-sm text-muted-foreground">{error}</p>
              </div>
              <div className="flex flex-col gap-2 w-full">
                <Button onClick={handleResend}>
                  Resend Confirmation Email
                </Button>
                <Button onClick={() => navigate('/auth/signin')} variant="ghost">
                  Back to Sign In
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </AuthLayout>
  );
}
