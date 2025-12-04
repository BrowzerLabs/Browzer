export interface AppSettings {
  general: {
    defaultSearchEngine: string;
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