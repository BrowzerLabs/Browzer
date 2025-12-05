import { useEffect, useState } from 'react';
import { History, Recordings, Automation, Settings } from '@/renderer/screens';
import Profile from '@/renderer/pages/Profile';
import { ROUTES } from '@/shared/routes';
import { SubscriptionPage } from '@/renderer/pages/SubscriptionPage';
import { ErrorPage } from '@/renderer/pages';

const ROUTE_COMPONENTS: Record<string, React.ComponentType> = {
  profile: Profile,
  settings: Settings,
  history: History,
  recordings: Recordings,
  automation: Automation,
  subscription: SubscriptionPage,
  error: ErrorPage,
};

export type InternalRouteName = keyof typeof ROUTES;

export function InternalRouter() {
  const [currentRoute, setCurrentRoute] = useState<InternalRouteName | null>(null);

  useEffect(() => {
    const checkRoute = () => {
      const hash = window.location.hash;
      console.log('InternalRouter: Checking route:', hash);
      
      // Extract route name from hash (e.g., #/settings -> settings, #/error?data=... -> error)
      const hashPath = hash.replace('#/', '').split('?')[0] as InternalRouteName;
      
      // Check for error page (special case with query params)
      if (hashPath === 'error') {
        setCurrentRoute('error' as InternalRouteName);
        document.title = 'Error - Browzer';
        return;
      }
      
      if (hashPath && ROUTES[hashPath]) {
        setCurrentRoute(hashPath);
        
        document.title = `${ROUTES[hashPath].title} - Browzer`;
      } else {
        setCurrentRoute(null);
      }
    };

    checkRoute();
    window.addEventListener('hashchange', checkRoute);
    
    return () => window.removeEventListener('hashchange', checkRoute);
  }, []);

  if (!currentRoute) {
    return (
      <main className='w-full h-full flex items-center justify-center'>
        <h1>InternalRouter: No matching route</h1>
      </main>
    )
  }

  const RouteComponent = ROUTE_COMPONENTS[currentRoute];

  return (
    <RouteComponent />
  );
}

export function useIsInternalPage(): boolean {
  const [isInternal, setIsInternal] = useState(false);

  useEffect(() => {
    const checkRoute = () => {
      const hash = window.location.hash;
      const hashPath = hash.replace('#/', '').split('?')[0] as InternalRouteName;
      
      if (hashPath === 'error') {
        setIsInternal(true);
        return;
      }
      
      setIsInternal(!!hashPath && !!ROUTES[hashPath]);
    };

    checkRoute();
    window.addEventListener('hashchange', checkRoute);
    
    return () => window.removeEventListener('hashchange', checkRoute);
  }, []);

  return isInternal;
}

export function getCurrentInternalRoute(): typeof ROUTES[InternalRouteName] | null {
  const hash = window.location.hash;
  const routeName = hash.replace('#/', '') as InternalRouteName;
  
  if (routeName && ROUTES[routeName]) {
    return ROUTES[routeName];
  }
  
  return null;
}
