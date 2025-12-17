import { useCallback, useEffect, useRef } from 'react';
import { useBrowserViewLayerStore } from '@/renderer/stores/browserViewLayerStore';

export function useBrowserViewLayer() {
  const { registerOverlay, unregisterOverlay } = useBrowserViewLayerStore();
  const registeredOverlaysRef = useRef(new Set<string>());

  // Cleanup all overlays registered by this component on unmount
  useEffect(() => {
    return () => {
      registeredOverlaysRef.current.forEach((id) => {
        unregisterOverlay(id);
      });
      registeredOverlaysRef.current.clear();
    };
  }, [unregisterOverlay]);

  const register = useCallback((id: string) => {
    registeredOverlaysRef.current.add(id);
    registerOverlay(id);
  }, [registerOverlay]);

  const unregister = useCallback((id: string) => {
    registeredOverlaysRef.current.delete(id);
    unregisterOverlay(id);
  }, [unregisterOverlay]);

  // Creates a handler for onOpenChange callbacks
  const createOverlayHandler = useCallback((id: string) => {
    return (open: boolean) => {
      if (open) {
        register(id);
      } else {
        unregister(id);
      }
    };
  }, [register, unregister]);

  return {
    registerOverlay: register,
    unregisterOverlay: unregister,
    createOverlayHandler,
  };
}

/**
 * Hook for visibility-based overlays (like FindBar, RestoreSessionPopup)
 * Automatically registers/unregisters based on visibility state
 */
export function useOverlayVisibility(id: string, isVisible: boolean) {
  const { registerOverlay, unregisterOverlay } = useBrowserViewLayerStore();

  useEffect(() => {
    if (isVisible) {
      registerOverlay(id);
    } 
    return () => {
      unregisterOverlay(id);
    };
  }, [id, isVisible, registerOverlay, unregisterOverlay]);
}
