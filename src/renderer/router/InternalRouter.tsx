import { useEffect, useState } from 'react';
import { History, Recordings, Profile, SignIn, SignUp, Settings } from '@/renderer/screens';

/**
 * Internal page routes configuration
 * Maps browzer:// URLs to their corresponding React components
 */
export const INTERNAL_ROUTES = {
  settings: {
    path: '/settings',
    component: Settings,
    title: 'Settings',
  },
  history: {
    path: '/history',
    component: History,
    title: 'History',
  },
  recordings: {
    path: '/recordings',
    component: Recordings,
    title: 'Recordings',
  },
  profile: {
    path: '/profile',
    component: Profile,
    title: 'Profile',
  },
  signin: {
    path: '/signin',
    component: SignIn,
    title: 'Sign In',
  },
  signup: {
    path: '/signup',
    component: SignUp,
    title: 'Sign Up',
  },
} as const;

export type InternalRouteName = keyof typeof INTERNAL_ROUTES;

export function InternalRouter() {
  const [currentRoute, setCurrentRoute] = useState<InternalRouteName | null>(null);

  useEffect(() => {
    const checkRoute = () => {
      const hash = window.location.hash;
      console.log('InternalRouter: Checking route:', hash);
      
      // Extract route name from hash (e.g., #/settings -> settings)
      const routeName = hash.replace('#/', '') as InternalRouteName;
      
      if (routeName && INTERNAL_ROUTES[routeName]) {
        console.log('InternalRouter: Matched route:', routeName);
        setCurrentRoute(routeName);
        
        // Update document title
        document.title = `${INTERNAL_ROUTES[routeName].title} - Browzer`;
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

  const RouteComponent = INTERNAL_ROUTES[currentRoute].component;

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
      setIsInternal(!!routeName && !!INTERNAL_ROUTES[routeName]);
    };

    checkRoute();
    window.addEventListener('hashchange', checkRoute);
    
    return () => window.removeEventListener('hashchange', checkRoute);
  }, []);

  return isInternal;
}

export function getCurrentInternalRoute(): typeof INTERNAL_ROUTES[InternalRouteName] | null {
  const hash = window.location.hash;
  const routeName = hash.replace('#/', '') as InternalRouteName;
  
  if (routeName && INTERNAL_ROUTES[routeName]) {
    return INTERNAL_ROUTES[routeName];
  }
  
  return null;
}
