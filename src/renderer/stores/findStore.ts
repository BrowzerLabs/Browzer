import { create } from 'zustand';

export interface FindState {
  isVisible: boolean;
  searchText: string;
  matchCount: number;
  activeMatch: number;
}

interface FindStore {
  state: FindState;
  setState: (state: Partial<FindState>) => void;
  toggleFindBar: () => void;
  closeFindBar: () => void;
}

const DEFAULT_STATE: FindState = {
  isVisible: false,
  searchText: '',
  matchCount: 0,
  activeMatch: 0,
};

export const useFindStore = create<FindStore>((set, get) => ({
  state: DEFAULT_STATE,

  setState: (newState) => set((store) => ({
    state: {
      ...store.state,
      ...newState
    }
  })),

  toggleFindBar: () => {
    const currentState = get().state;
    set({
      state: {
        ...currentState,
        isVisible: !currentState.isVisible
      }
    });
  },

  closeFindBar: () => {
    const currentState = get().state;
    set({
      state: {
        ...currentState,
        isVisible: false
      }
    });
  }
}));

