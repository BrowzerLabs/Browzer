export interface AppSettings {
  general: {
    searchEngineId: string;
    /** URL for new tab page. Empty string means use built-in new tab page */
    newTabUrl: string;
  };
  
  privacy: {
    clearCacheOnExit: boolean;
    doNotTrack: boolean;
    blockThirdPartyCookies: boolean;
  };
  
  appearance: {
    fontSize: number;
    showBookmarksBar: boolean;
  };
}