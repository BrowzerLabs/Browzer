import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface OnboardingState {
  hasCompletedOnboarding: boolean;
  setHasCompletedOnboarding: (completed: boolean) => void;
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,

      setHasCompletedOnboarding: (completed) =>
        set({ hasCompletedOnboarding: completed }),

      completeOnboarding: () => set({ hasCompletedOnboarding: true }),

      resetOnboarding: () => set({ hasCompletedOnboarding: false }),
    }),
    {
      name: 'browzer-onboarding-storage',
    }
  )
);
