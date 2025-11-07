import { ReactNode, useEffect, useState, useRef } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/renderer/hooks/useAuth';
import { Loader2 } from 'lucide-react';

/**
 * ProtectedRoute - Protects routes requiring authentication
 * 
 * Flow:
 * 1. Check if user is authenticated
 * 2. If loading, show spinner
 * 3. If not authenticated, redirect to /auth/signin
 * 4. If authenticated but browser not ready, initialize browser
 * 5. If ready, render children
 */

interface ProtectedRouteProps {
  children: ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, loading } = useAuth();
  const [browserReady, setBrowserReady] = useState(false);
  const browserInitRef = useRef(false);

  // Initialize browser when authenticated
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
      .catch((error) => {
        console.error('[ProtectedRoute] Browser initialization failed:', error);
        browserInitRef.current = false;
      });
  }, [isAuthenticated, browserReady]);

  // Reset browser state on sign out
  useEffect(() => {
    if (!isAuthenticated && browserReady) {
      console.log('[ProtectedRoute] User signed out, resetting browser');
      setBrowserReady(false);
      browserInitRef.current = false;
    }
  }, [isAuthenticated, browserReady]);

  // Loading state
  if (loading) {
    return (
      <div className="h-screen flex flex-col items-center justify-center">
        <Loader2 className="size-7 animate-spin" />
      </div>
    );
  }

  // Not authenticated - redirect to sign in
  if (!isAuthenticated) {
    return <Navigate to="/auth/signin" replace />;
  }

  // Authenticated but browser not ready
  if (!browserReady) {
    return (
      <div className="h-screen flex flex-col items-center justify-center">
        <Loader2 className="size-7 animate-spin" />
      </div>
    );
  }

  // Fully ready - render protected content
  return <>{children}</>;
}
