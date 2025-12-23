export interface AppSettings {
  general: {
    searchEngineId: string;
    newTabUrl: string;
  };

  privacy: {
    clearCacheOnExit: boolean;
    doNotTrack: boolean;
    blockThirdPartyCookies: boolean;
    enableAdBlocker: boolean;
  };

  appearance: {
    fontSize: number;
    showBookmarksBar: boolean;
  };
}
