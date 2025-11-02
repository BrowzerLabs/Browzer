import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/renderer/components/auth/ProtectedRoute';
import { SignInPage, SignUpPage, ForgotPasswordPage } from '@/renderer/pages/auth';
import { ConfirmSignupPage } from '@/renderer/pages/auth/ConfirmSignupPage';
import { ResetPasswordCallbackPage } from '@/renderer/pages/auth/ResetPasswordCallbackPage';
import { BrowserChrome } from '@/renderer/components/BrowserChrome';
import { InternalRouter, useIsInternalPage } from './InternalRouter';
import { useDeepLink } from '@/renderer/hooks/useDeepLink';
import NotFound from '@/renderer/pages/not-found';

function MainApp() {
  const isInternalPage = useIsInternalPage();
  
  return isInternalPage ? <InternalRouter /> : <BrowserChrome />;
}

function AppRoutes() {
  // Initialize global deep link handler (must be inside Router context)
  useDeepLink();

  return (
    <Routes>
      {/* Public Auth Routes */}
      <Route path="/auth/signin" element={<SignInPage />} />
      <Route path="/auth/signup" element={<SignUpPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      
      {/* Magic Link Callback Routes */}
      <Route path="/auth/confirm-signup" element={<ConfirmSignupPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordCallbackPage />} />
      
      {/* Protected Main App Route */}
      <Route 
        path="/*" 
        element={
          <ProtectedRoute>
            <MainApp />
          </ProtectedRoute>
        } 
      />
      
      {/* Fallback - redirect to signin */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}
