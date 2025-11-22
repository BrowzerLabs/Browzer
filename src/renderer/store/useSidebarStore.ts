import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
const notifyMainProcess = (visible: boolean, widthPercent: number) => {
  if (window.browserAPI) {
    window.browserAPI.setSidebarState(visible, widthPercent).catch(console.error);
  }
};

interface SidebarState {
  isVisible: boolean;
  widthPercent: number;
  toggleSidebar: () => void;
  showSidebar: () => void;
  hideSidebar: () => void;
  setWidth: (widthPercent: number) => void;
}

/**
 * Simplified Sidebar Store
 * 
 * Manages only essential sidebar state:
 * - Visibility toggle
 * - Width percentage
 * - Persistent across app restarts
 */
export const useSidebarStore = create<SidebarState>()(
  persist(
    (set, get) => ({
      isVisible: true,
      widthPercent: 30,
      toggleSidebar: () => {
        const currentVisibility = get().isVisible;
        const newVisibility = !currentVisibility;
        const width = get().widthPercent;
        
        set({ isVisible: newVisibility });
        notifyMainProcess(newVisibility, width);
      },
      showSidebar: () => {
        const width = get().widthPercent;
        set({ isVisible: true });
        notifyMainProcess(true, width);
      },
      hideSidebar: () => {
        set({ isVisible: false });
        notifyMainProcess(false, 0);
      },
      setWidth: (widthPercent: number) => {
        const isVisible = get().isVisible;
        set({ widthPercent });
        if (isVisible) {
          notifyMainProcess(true, widthPercent);
        }
      },
    }),
    {
      name: 'browzer-sidebar-storage',
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        // After hydration from localStorage, sync with main process
        if (state) {
          notifyMainProcess(state.isVisible, state.widthPercent);
        }
      },
    }
  )
);