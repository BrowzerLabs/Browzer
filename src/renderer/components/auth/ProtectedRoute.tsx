import { ReactNode, useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/renderer/hooks/useAuth';
import { Loader2, Shield, ShieldCheckIcon } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();
  const [browserReady, setBrowserReady] = useState(false);
  const browserInitRef = useRef(false);

  useEffect(() => {
    const shouldInitialize = isAuthenticated && !browserReady && !browserInitRef.current;
    
    if (!shouldInitialize) return;

    browserInitRef.current = true;
    console.log('[ProtectedRoute] Initializing browser...');

    window.browserAPI
      .initializeBrowser()
      .then(() => {
        console.log('[ProtectedRoute] Browser ready');
        setBrowserReady(true);
      })
      .catch((error: any) => {
        console.error('[ProtectedRoute] Browser initialization failed:', error);
        browserInitRef.current = false;
      });
  }, [isAuthenticated, browserReady]);

  useEffect(() => {
    if (!isAuthenticated && browserReady) {
      console.log('[ProtectedRoute] User signed out, resetting browser');
      setBrowserReady(false);
      browserInitRef.current = false;
    }
  }, [isAuthenticated, browserReady]);

  if (loading) {
    return (
      <div className="h-screen flex flex-col gap-2 items-center justify-center animate-pulse text-blue-600 dark:text-blue-400 bg-background">
        <ShieldCheckIcon className="size-10" />
        <p className='text-xs'>Verifying wheather its really you</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/auth/signin" replace />;
  }

  if (!browserReady) {
    return (
      <div className="h-screen flex flex-col items-center justify-center gap-2 text-teal-500 bg-background">
        <Loader2 className="size-7 animate-spin" />
        <p className='animate-pulse text-xs'>Setting up your Browzer</p>
      </div>
    );
  }

  return <>{children}</>;
}
