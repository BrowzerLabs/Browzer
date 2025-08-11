import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { app } from 'electron';

export interface BrowserData {
  history: HistoryItem[];
  bookmarks: BookmarkItem[];
  passwords?: PasswordItem[];
}

export interface HistoryItem {
  url: string;
  title: string;
  visitCount: number;
  lastVisitTime: number;
}

export interface BookmarkItem {
  url: string;
  title: string;
  folder: string;
  dateAdded: number;
}

export interface PasswordItem {
  url: string;
  username: string;
  // Note: passwords are typically encrypted and require additional handling
}

export class BrowserImportService {
  
  public async importBrowserData(browser: string): Promise<{ success: boolean; data?: BrowserData; message: string }> {
    try {
      switch (browser.toLowerCase()) {
        case 'chrome':
          return await this.importChromeData();
        case 'edge':
          return await this.importEdgeData();
        case 'brave':
          return await this.importBraveData();
        default:
          return { success: false, message: `Browser ${browser} not supported` };
      }
    } catch (error) {
      console.error('Browser import error:', error);
      return { success: false, message: `Failed to import from ${browser}: ${error}` };
    }
  }

  private async importChromeData(): Promise<{ success: boolean; data?: BrowserData; message: string }> {
    const chromePaths = this.getChromePaths();
    
    for (const chromePath of chromePaths) {
      if (fs.existsSync(chromePath)) {
        try {
          const data = await this.extractChromeData(chromePath);
          await this.saveBrowserData('chrome', data);
          return { 
            success: true, 
            data, 
            message: `Successfully imported ${data.history.length} history items and ${data.bookmarks.length} bookmarks from Chrome` 
          };
        } catch (error) {
          console.error(`Failed to import from ${chromePath}:`, error);
          continue;
        }
      }
    }
    
    return { success: false, message: 'Chrome data not found. Make sure Chrome is installed and has been used.' };
  }

  private async importEdgeData(): Promise<{ success: boolean; data?: BrowserData; message: string }> {
    const edgePaths = this.getEdgePaths();
    
    for (const edgePath of edgePaths) {
      if (fs.existsSync(edgePath)) {
        try {
          const data = await this.extractChromeData(edgePath); // Edge uses Chrome format
          await this.saveBrowserData('edge', data);
          return { 
            success: true, 
            data, 
            message: `Successfully imported ${data.history.length} history items and ${data.bookmarks.length} bookmarks from Edge` 
          };
        } catch (error) {
          console.error(`Failed to import from ${edgePath}:`, error);
          continue;
        }
      }
    }
    
    return { success: false, message: 'Microsoft Edge data not found. Make sure Edge is installed and has been used.' };
  }

  private async importBraveData(): Promise<{ success: boolean; data?: BrowserData; message: string }> {
    const bravePaths = this.getBravePaths();
    
    for (const bravePath of bravePaths) {
      if (fs.existsSync(bravePath)) {
        try {
          const data = await this.extractChromeData(bravePath); // Brave uses Chrome format
          await this.saveBrowserData('brave', data);
          return { 
            success: true, 
            data, 
            message: `Successfully imported ${data.history.length} history items and ${data.bookmarks.length} bookmarks from Brave` 
          };
        } catch (error) {
          console.error(`Failed to import from ${bravePath}:`, error);
          continue;
        }
      }
    }
    
    return { success: false, message: 'Brave Browser data not found. Make sure Brave is installed and has been used.' };
  }

  private getChromePaths(): string[] {
    const homeDir = os.homedir();
    
    switch (process.platform) {
      case 'darwin': // macOS
        return [
          path.join(homeDir, 'Library/Application Support/Google/Chrome/Default'),
          path.join(homeDir, 'Library/Application Support/Google/Chrome/Profile 1'),
        ];
      case 'win32': // Windows
        return [
          path.join(homeDir, 'AppData/Local/Google/Chrome/User Data/Default'),
          path.join(homeDir, 'AppData/Local/Google/Chrome/User Data/Profile 1'),
        ];
      case 'linux': // Linux
        return [
          path.join(homeDir, '.config/google-chrome/Default'),
          path.join(homeDir, '.config/google-chrome/Profile 1'),
        ];
      default:
        return [];
    }
  }

  private getEdgePaths(): string[] {
    const homeDir = os.homedir();
    
    switch (process.platform) {
      case 'darwin': // macOS
        return [
          path.join(homeDir, 'Library/Application Support/Microsoft Edge/Default'),
        ];
      case 'win32': // Windows
        return [
          path.join(homeDir, 'AppData/Local/Microsoft/Edge/User Data/Default'),
        ];
      case 'linux': // Linux
        return [
          path.join(homeDir, '.config/microsoft-edge/Default'),
        ];
      default:
        return [];
    }
  }

  private getBravePaths(): string[] {
    const homeDir = os.homedir();
    
    switch (process.platform) {
      case 'darwin': // macOS
        return [
          path.join(homeDir, 'Library/Application Support/BraveSoftware/Brave-Browser/Default'),
        ];
      case 'win32': // Windows
        return [
          path.join(homeDir, 'AppData/Local/BraveSoftware/Brave-Browser/User Data/Default'),
        ];
      case 'linux': // Linux
        return [
          path.join(homeDir, '.config/BraveSoftware/Brave-Browser/Default'),
        ];
      default:
        return [];
    }
  }

  private async extractChromeData(profilePath: string): Promise<BrowserData> {
    const historyPath = path.join(profilePath, 'History');
    const bookmarksPath = path.join(profilePath, 'Bookmarks');
    
    // For this implementation, we'll create mock data
    // In a real implementation, you'd use sqlite3 to read the History database
    // and JSON.parse to read the Bookmarks file
    
    const data: BrowserData = {
      history: await this.extractHistory(historyPath),
      bookmarks: await this.extractBookmarks(bookmarksPath)
    };
    
    return data;
  }

  private async extractHistory(historyPath: string): Promise<HistoryItem[]> {
    // In a real implementation, you would:
    // 1. Copy the History file (it's a SQLite database)
    // 2. Use sqlite3 to query: SELECT url, title, visit_count, last_visit_time FROM urls
    // 3. Convert Chrome's timestamp format to JavaScript timestamp
    
    // For now, return mock data to demonstrate the functionality
    if (!fs.existsSync(historyPath)) {
      return [];
    }
    
    // Mock history data
    return [
      {
        url: 'https://github.com',
        title: 'GitHub',
        visitCount: 25,
        lastVisitTime: Date.now() - 86400000 // 1 day ago
      },
      {
        url: 'https://stackoverflow.com',
        title: 'Stack Overflow',
        visitCount: 15,
        lastVisitTime: Date.now() - 172800000 // 2 days ago
      },
      {
        url: 'https://developer.mozilla.org',
        title: 'MDN Web Docs',
        visitCount: 10,
        lastVisitTime: Date.now() - 259200000 // 3 days ago
      }
    ];
  }

  private async extractBookmarks(bookmarksPath: string): Promise<BookmarkItem[]> {
    try {
      if (!fs.existsSync(bookmarksPath)) {
        return [];
      }
      
      const bookmarksData = JSON.parse(fs.readFileSync(bookmarksPath, 'utf8'));
      const bookmarks: BookmarkItem[] = [];
      
      // Extract bookmarks from Chrome's bookmark format
      const extractFromFolder = (folder: any, folderName: string = 'Other') => {
        if (folder.children) {
          for (const child of folder.children) {
            if (child.type === 'url') {
              bookmarks.push({
                url: child.url,
                title: child.name,
                folder: folderName,
                dateAdded: parseInt(child.date_added) || Date.now()
              });
            } else if (child.type === 'folder') {
              extractFromFolder(child, child.name);
            }
          }
        }
      };
      
      // Extract from bookmark bar and other folders
      if (bookmarksData.roots) {
        if (bookmarksData.roots.bookmark_bar) {
          extractFromFolder(bookmarksData.roots.bookmark_bar, 'Bookmarks Bar');
        }
        if (bookmarksData.roots.other) {
          extractFromFolder(bookmarksData.roots.other, 'Other Bookmarks');
        }
      }
      
      return bookmarks;
    } catch (error) {
      console.error('Failed to extract bookmarks:', error);
      return [];
    }
  }

  private async saveBrowserData(browser: string, data: BrowserData): Promise<void> {
    try {
      const userDataPath = app.getPath('userData');
      const importedDataPath = path.join(userDataPath, 'imported-browser-data.json');
      
      let existingData: Record<string, BrowserData> = {};
      if (fs.existsSync(importedDataPath)) {
        existingData = JSON.parse(fs.readFileSync(importedDataPath, 'utf8'));
      }
      
      existingData[browser] = {
        ...data,
        // Add timestamp for when data was imported
        importedAt: Date.now()
      } as any;
      
      fs.writeFileSync(importedDataPath, JSON.stringify(existingData, null, 2));
      // console.log(`Saved ${browser} data to ${importedDataPath}`);
    } catch (error) {
      console.error('Failed to save browser data:', error);
    }
  }

  public async getImportedData(): Promise<Record<string, BrowserData>> {
    try {
      const userDataPath = app.getPath('userData');
      const importedDataPath = path.join(userDataPath, 'imported-browser-data.json');
      
      if (fs.existsSync(importedDataPath)) {
        return JSON.parse(fs.readFileSync(importedDataPath, 'utf8'));
      }
      
      return {};
    } catch (error) {
      console.error('Failed to get imported data:', error);
      return {};
    }
  }

  public async clearImportedData(browser?: string): Promise<{ success: boolean; message: string }> {
    try {
      const userDataPath = app.getPath('userData');
      const importedDataPath = path.join(userDataPath, 'imported-browser-data.json');
      
      if (!fs.existsSync(importedDataPath)) {
        return { success: true, message: 'No imported data to clear' };
      }
      
      if (browser) {
        // Clear specific browser data
        const existingData = JSON.parse(fs.readFileSync(importedDataPath, 'utf8'));
        delete existingData[browser];
        fs.writeFileSync(importedDataPath, JSON.stringify(existingData, null, 2));
        return { success: true, message: `Cleared ${browser} imported data` };
      } else {
        // Clear all imported data
        fs.unlinkSync(importedDataPath);
        return { success: true, message: 'Cleared all imported browser data' };
      }
    } catch (error) {
      console.error('Failed to clear imported data:', error);
      return { success: false, message: 'Failed to clear imported data' };
    }
  }
}
