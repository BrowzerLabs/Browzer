import { useEffect, useState } from 'react';
import { History, Recordings, Automation, Settings } from '@/renderer/screens';
import Profile from '@/renderer/pages/Profile';
import { ROUTES } from '@/shared/routes';

/**
 * Internal page routes - Maps route names to React components
 */
const ROUTE_COMPONENTS: Record<string, React.ComponentType> = {
  profile: Profile,
  settings: Settings,
  history: History,
  recordings: Recordings,
  automation: Automation,
};

export type InternalRouteName = keyof typeof ROUTES;

export function InternalRouter() {
  const [currentRoute, setCurrentRoute] = useState<InternalRouteName | null>(null);

  useEffect(() => {
    const checkRoute = () => {
      const hash = window.location.hash;
      console.log('InternalRouter: Checking route:', hash);
      
      // Extract route name from hash (e.g., #/settings -> settings)
      const routeName = hash.replace('#/', '') as InternalRouteName;
      
      if (routeName && ROUTES[routeName]) {
        console.log('InternalRouter: Matched route:', routeName);
        setCurrentRoute(routeName);
        
        // Update document title
        document.title = `${ROUTES[routeName].title} - Browzer`;
      } else {
        console.log('InternalRouter: No matching route');
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
      const routeName = hash.replace('#/', '') as InternalRouteName;
      setIsInternal(!!routeName && !!ROUTES[routeName]);
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
