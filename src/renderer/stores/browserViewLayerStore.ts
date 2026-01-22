import { create } from 'zustand';

interface BrowserViewLayerStore {
  openOverlays: Set<string>;
  registerOverlay: (id: string) => void;
  unregisterOverlay: (id: string) => void;
  hasOpenOverlays: () => boolean;
}

export const useBrowserViewLayerStore = create<BrowserViewLayerStore>(
  (set, get) => ({
    openOverlays: new Set<string>(),

    registerOverlay: (id: string) => {
      const { openOverlays } = get();
      if (openOverlays.has(id)) return;

      const newOverlays = new Set(openOverlays);
      newOverlays.add(id);
      set({ openOverlays: newOverlays });

      if (newOverlays.size >= 1) {
        window.browserAPI.bringBrowserViewToFront();
      }
    },

    unregisterOverlay: (id: string) => {
      const { openOverlays } = get();
      if (!openOverlays.has(id)) return;

      const newOverlays = new Set(openOverlays);
      newOverlays.delete(id);
      set({ openOverlays: newOverlays });

      if (newOverlays.size === 0) {
        window.browserAPI.bringBrowserViewToBottom();
      }
    },

    hasOpenOverlays: () => get().openOverlays.size > 0,
  })
);
