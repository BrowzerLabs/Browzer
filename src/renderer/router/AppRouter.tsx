import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/renderer/components/auth/ProtectedRoute';
import { SignInPage, SignUpPage, ForgotPasswordPage } from '@/renderer/pages/auth';
import { ConfirmSignupPage } from '@/renderer/pages/auth/ConfirmSignupPage';
import { ResetPasswordCallbackPage } from '@/renderer/pages/auth/ResetPasswordCallbackPage';
import { SubscriptionSuccessPage } from '@/renderer/pages/subscription/SubscriptionSuccessPage';
import { SubscriptionCancelPage } from '@/renderer/pages/subscription/SubscriptionCancelPage';
import { BrowserChrome } from '@/renderer/components/BrowserChrome';
import { InternalRouter, useIsInternalPage } from './InternalRouter';
import { useDeepLink } from '@/renderer/hooks/useDeepLink';
import NotFound from '@/renderer/pages/NotFound';
import { NotificationProvider } from '@/renderer/providers/NotificationProvider';
import { OnboardingFlow } from '@/renderer/pages/onboarding';
import { useOnboardingStore } from '@/renderer/stores/onboardingStore';

function MainApp() {
  const isInternalPage = useIsInternalPage();
  
  return isInternalPage ? <InternalRouter /> : <BrowserChrome />;
}

function AppRoutes() {
  useDeepLink();
  const { hasCompletedOnboarding } = useOnboardingStore();

  if (!hasCompletedOnboarding) {
    return (
      <Routes>
        <Route path="/onboarding" element={<OnboardingFlow />} />
        <Route path="*" element={<Navigate to="/onboarding" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      
      <Route 
        path="/auth/signin" 
        element={
          <SignInPage />
        } 
      />
      <Route path="/auth/signup" element={<SignUpPage />} />
      <Route path="/auth/forgot-password" element={<ForgotPasswordPage />} />
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
    <HashRouter>
      <NotificationProvider>
        <AppRoutes />
      </NotificationProvider>
    </HashRouter>
  );
}
