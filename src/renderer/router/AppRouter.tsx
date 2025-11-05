import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { OnboardingPage } from '@/renderer/pages/onboarding';
import { useOnboardingStore } from '@/renderer/stores/onboardingStore';

function MainApp() {
  const isInternalPage = useIsInternalPage();
  
  return isInternalPage ? <InternalRouter /> : <BrowserChrome />;
}

function AppRoutes() {
  useDeepLink();
  const { hasCompletedOnboarding } = useOnboardingStore();

  return (
    <Routes>
      <Route path="/onboarding" element={<OnboardingPage />} />
      
      <Route 
        path="/auth/signin" 
        element={
          hasCompletedOnboarding ? <SignInPage /> : <Navigate to="/onboarding" replace />
        } 
      />
      <Route path="/auth/signup" element={<SignUpPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
      
      <Route path="/pricing" element={<PricingPage />} />
      
      <Route path="/auth/confirm-signup" element={<ConfirmSignupPage />} />
      <Route path="/auth/reset-password" element={<ResetPasswordCallbackPage />} />
      
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
      
      <Route 
        path="/*" 
        element={
          <ProtectedRoute>
            <MainApp />
          </ProtectedRoute>
        } 
      />
      
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
