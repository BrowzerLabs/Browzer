import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Onboarding Store - Tracks first-time user onboarding completion
 * 
 * Uses localStorage to persist state across app restarts
 */

interface OnboardingStore {
  hasCompletedOnboarding: boolean;
  completeOnboarding: () => void;
  resetOnboarding: () => void; // For testing/debugging
}

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set) => ({
      hasCompletedOnboarding: false,
      
      completeOnboarding: () => set({ hasCompletedOnboarding: true }),
      
      resetOnboarding: () => set({ hasCompletedOnboarding: false }),
    }),
    {
      name: 'browzer-onboarding-storage',
    }
  )
);
