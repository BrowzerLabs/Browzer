import { ReactNode, MouseEvent } from 'react';
import { cn } from '@/renderer/lib/utils';

interface LinkProps {
  /**
   * URL to navigate to
   * - Internal routes: Use hash routes like "#/settings", "#/history"
   * - External URLs: Use full URLs like "https://example.com"
   * - Browser tabs: Use full URLs to open in browser tab
   */
  href: string;
  
  /**
   * Link content
   */
  children: ReactNode;
  
  /**
   * Where to open the link
   * - 'internal': Navigate within the app (hash routing)
   * - 'tab': Open in a new browser tab
   * - 'external': Open in system default browser (external to app)
   */
  target?: 'internal' | 'tab' | 'external';
  
  /**
   * Additional CSS classes
   */
  className?: string;
  
  /**
   * Click handler (called before navigation)
   */
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Universal Link component for Browzer
 * 
 * Handles three types of navigation:
 * 1. Internal routing (hash-based for internal pages like settings)
 * 2. Browser tab navigation (opens URL in new tab within Browzer)
 * 3. External links (opens in system default browser)
 * 
 * @example
 * // Internal navigation
 * <Link href="#/settings">Settings</Link>
 * 
 * @example
 * // Open in browser tab
 * <Link href="https://github.com" target="tab">GitHub</Link>
 * 
 * @example
 * // Open in external browser
 * <Link href="https://google.com" target="external">Google</Link>
 */
export function Link({ 
  href, 
  children, 
  target = 'internal', 
  className,
  onClick 
}: LinkProps) {
  
  const handleClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    
    // Call custom onClick if provided
    onClick?.(e);
    
    try {
      if (target === 'internal') {
        // Internal hash routing
        if (href.startsWith('#/')) {
          window.location.hash = href;
        } else {
          console.warn(`Internal link should start with #/, got: ${href}`);
          window.location.hash = href;
        }
      } else if (target === 'tab') {
        // Open in new browser tab within Browzer
        if (window.browserAPI) {
          await window.browserAPI.createTab(href);
        } else {
          console.error('browserAPI not available');
        }
      } else if (target === 'external') {
        // Open in system default browser (external to Browzer)
        // This would require an IPC call to shell.openExternal
        // For now, open in new tab as fallback
        if (window.browserAPI) {
          await window.browserAPI.createTab(href);
        }
      }
    } catch (error) {
      console.error('Link navigation failed:', error);
    }
  };
  
  return (
    <a
      href={href}
      onClick={handleClick}
      className={cn(
        'text-primary hover:underline cursor-pointer transition-colors',
        className
      )}
      rel={target === 'external' ? 'noopener noreferrer' : undefined}
    >
      {children}
    </a>
  );
}