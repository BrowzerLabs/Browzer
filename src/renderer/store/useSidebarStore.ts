import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

interface SidebarState {
  isVisible: boolean;
  toggleSidebar: () => void;
  showSidebar: () => void;
  hideSidebar: () => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      isVisible: true,
      toggleSidebar: () => {
        const currentVisibility = get().isVisible;
        const newVisibility = !currentVisibility;
        
        set({ isVisible: newVisibility });
        window.browserAPI.setSidebarState(newVisibility);
      },
      showSidebar: () => {
        set({ isVisible: true });
        window.browserAPI.setSidebarState(true);
      },
      hideSidebar: () => {
        set({ isVisible: false });
        window.browserAPI.setSidebarState(false);
      },
    }),
    {
      name: 'browzer-sidebar-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) {
          window.browserAPI.setSidebarState(state.isVisible);
        }
      },
    }
  )
);