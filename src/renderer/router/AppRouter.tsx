import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ProtectedRoute } from '@/renderer/components/auth/ProtectedRoute';
import { SignInPage, SignUpPage, ForgotPasswordPage } from '@/renderer/pages/auth';
import { ConfirmSignupPage } from '@/renderer/pages/auth/ConfirmSignupPage';
import { ResetPasswordCallbackPage } from '@/renderer/pages/auth/ResetPasswordCallbackPage';
import { PricingPage } from '@/renderer/pages/PricingPage';
import { SubscriptionSuccessPage } from '@/renderer/pages/subscription/SubscriptionSuccessPage';
import { SubscriptionCancelPage } from '@/renderer/pages/subscription/SubscriptionCancelPage';
import { BrowserChrome } from '@/renderer/components/BrowserChrome';
import { InternalRouter, useIsInternalPage } from './InternalRouter';
import { useDeepLink } from '@/renderer/hooks/useDeepLink';
import NotFound from '@/renderer/pages/not-found';
import { NotificationProvider } from '@/renderer/providers/NotificationProvider';

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
      
      {/* Public Pricing Page */}
      <Route path="/pricing" element={<PricingPage />} />
      
      {/* Magic Link Callback Routes */}
      <Route path="/auth/confirm-signup" element={<ConfirmSignupPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordCallbackPage />} />
      
      {/* Subscription Callback Routes (Protected) */}
      <Route 
        path="/subscription/success" 
        element={
          <ProtectedRoute>
            <SubscriptionSuccessPage />
          </ProtectedRoute>
        } 
      />
      <Route 
        path="/subscription/cancel" 
        element={
          <ProtectedRoute>
            <SubscriptionCancelPage />
          </ProtectedRoute>
        } 
      />
      
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
      <NotificationProvider>
        <AppRoutes />
      </NotificationProvider>
    </BrowserRouter>
  );
}
