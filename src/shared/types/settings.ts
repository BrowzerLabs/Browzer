export interface AppSettings {
  general: {
    defaultSearchEngine: string;
    newTabPage: string;
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