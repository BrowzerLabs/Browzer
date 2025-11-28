import { Clock, type LucideIcon, Settings, Video, Bot, User, CreditCard, MailCheck, KeyRound, CheckCircle, XCircle, Loader2 } from "lucide-react";

export interface RouteConfig {
  path: string;
  title: string;
  icon?: string;
  params?: string;
  fragment?: string;
}

/**
 * Internal routes - Load in tabs with browzer:// protocol
 */
export const ROUTES: Record<string, RouteConfig> = {
  'auth/confirm-signup': {
    path: '/auth/confirm-signup',
    title: 'Confirm Email',
    icon: 'mail-check',
  },
  'auth/reset-password': {
    path: '/auth/reset-password',
    title: 'Reset Password',
    icon: 'key-round',
  },
  'auth/callback': {
    path: '/auth/callback',
    title: 'OAuth Callback',
    icon: 'loader',
  },
  'subscription/success': {
    path: '/subscription/success',
    title: 'Subscription Success',
    icon: 'check-circle',
  },
  'subscription/cancel': {
    path: '/subscription/cancel',
    title: 'Checkout Cancelled',
    icon: 'x-circle',
  },
  pricing: {
    path: '/pricing',
    title: 'Pricing',
    icon: 'credit-card',
  },
  settings: {
    path: '/settings',
    title: 'Settings',
    icon: 'settings',
  },
  history: {
    path: '/history',
    title: 'History',
    icon: 'clock',
  },
  recordings: {
    path: '/recordings',
    title: 'Recordings',
    icon: 'video',
  },
  automation: {
    path: '/automation',
    title: 'Automation',
    icon: 'bot',
  },
  profile: {
    path: '/profile',
    title: 'Profile',
    icon: 'user',
  },
  subscription: {
    path: '/subscription',
    title: 'Subscription',
    icon: 'credit-card',
  },
};

export const ICON_MAP: Record<string, LucideIcon> = {
  'settings': Settings,
  'clock': Clock,
  'video': Video,
  'bot': Bot,
  'user': User,
  'credit-card': CreditCard,
  'mail-check': MailCheck,
  'key-round': KeyRound,
  'check-circle': CheckCircle,
  'x-circle': XCircle,
  'loader': Loader2,
};

export function getRouteFromURL(url: string): RouteConfig | null {
  try {
    if (!url.startsWith('browzer://')) return null;

    const urlWithoutProtocol = url.replace('browzer://', '');
    const hashIndex = urlWithoutProtocol.indexOf('#');
    const queryIndex = urlWithoutProtocol.indexOf('?');
    
    let pathPart: string;
    let queryPart = '';
    let fragmentPart = '';
    
    if (hashIndex !== -1 && (queryIndex === -1 || hashIndex < queryIndex)) {
      // Has fragment, might have query after it
      pathPart = urlWithoutProtocol.substring(0, hashIndex);
      const afterHash = urlWithoutProtocol.substring(hashIndex + 1);
      const queryInFragment = afterHash.indexOf('?');
      if (queryInFragment !== -1) {
        fragmentPart = afterHash.substring(0, queryInFragment);
        queryPart = afterHash.substring(queryInFragment + 1);
      } else {
        fragmentPart = afterHash;
      }
    } else if (queryIndex !== -1) {
      // Has query, might have fragment after it
      pathPart = urlWithoutProtocol.substring(0, queryIndex);
      const afterQuery = urlWithoutProtocol.substring(queryIndex + 1);
      const fragmentInQuery = afterQuery.indexOf('#');
      if (fragmentInQuery !== -1) {
        queryPart = afterQuery.substring(0, fragmentInQuery);
        fragmentPart = afterQuery.substring(fragmentInQuery + 1);
      } else {
        queryPart = afterQuery;
      }
    } else {
      pathPart = urlWithoutProtocol;
    }
    
    // Remove trailing slash
    pathPart = pathPart.replace(/\/$/, '');
    
    // Try to match the full path first (e.g., "auth/confirm-signup")
    // If not found, try the last segment (e.g., "confirm-signup")
    let route = ROUTES[pathPart];
    
    if (!route) {
      const segments = pathPart.split('/');
      const lastSegment = segments[segments.length - 1];
      route = ROUTES[lastSegment];
    }
    
    if (!route) {
      console.warn('[getRouteFromURL] No route found for:', pathPart);
      return null;
    }
    
    // Return route with preserved params and fragment
    return {
      ...route,
      params: queryPart || undefined,
      fragment: fragmentPart || undefined,
    };
  } catch (error) {
    console.error('[getRouteFromURL] Parse error:', error);
    return null;
  }
}