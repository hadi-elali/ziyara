import { createContext, type PropsWithChildren, useCallback, useContext, useMemo, useState } from 'react';

type OnboardingState = {
  completeOnboarding: () => void;
  hasCompletedOnboarding: boolean;
};

const OnboardingContext = createContext<OnboardingState | null>(null);

/** The intro is acknowledged for this app launch only; language remains persisted separately. */
export function OnboardingProvider({ children }: PropsWithChildren) {
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  const completeOnboarding = useCallback(() => {
    setHasCompletedOnboarding(true);
  }, []);

  const value = useMemo(
    () => ({ completeOnboarding, hasCompletedOnboarding }),
    [completeOnboarding, hasCompletedOnboarding],
  );

  return <OnboardingContext.Provider value={value}>{children}</OnboardingContext.Provider>;
}

export function useOnboarding() {
  const context = useContext(OnboardingContext);
  if (!context) throw new Error('useOnboarding requires OnboardingProvider.');
  return context;
}
