import { app, session } from 'electron';
import * as path from 'path';
import { AdBlocker } from './AdBlocker';

export class AppManager {
  private adBlocker!: AdBlocker;
  async initialize(): Promise<void> {
    // Set app properties
    this.configureApp();
    
    // Initialize ad blocker
    this.adBlocker = new AdBlocker();
    
    // Configure session
    this.configureSession();
    
    // Initialize ad blocker after session is configured
    this.adBlocker.initialize();
  }

  private configureApp(): void {
    // Set multiple name properties for comprehensive coverage
    app.setName('Browzer');
    
    if (process.platform === 'darwin') {
      try {
        app.setAppUserModelId('com.browzer.app');
        app.setAboutPanelOptions({
          applicationName: 'Browzer',
          applicationVersion: '1.0.0',
          copyright: 'Copyright © 2025 Browzer'
        });
      } catch (error) {
        console.log('Could not set macOS-specific app properties:', error);
      }
    }
  }

  private configureSession(): void {
    // Enhanced user agent that OAuth providers are more likely to accept
    const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0';
    
    session.defaultSession.setUserAgent(userAgent);

    // Configure permissions for OAuth flows
    session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
      const url = webContents.getURL();
      console.log(`Permission request: ${permission} for ${url}`);
      
      // Allow permissions for OAuth providers
      const isOAuthProvider = url.includes('accounts.google.com') || 
                             url.includes('login.microsoftonline.com') ||
                             url.includes('github.com') ||
                             url.includes('oauth') ||
                             url.includes('auth');
      
      if (isOAuthProvider) {
        callback(true);
      } else if (permission === 'notifications') {
        callback(true); // Generally allow notifications
      } else {
        callback(false);
      }
    });

    // Configure certificate error handling for OAuth
    session.defaultSession.setCertificateVerifyProc((request, callback) => {
      const { hostname } = request;
      
      // For OAuth providers, we might need to be more lenient
      // but still maintain security for other sites
      if (hostname.includes('accounts.google.com') || 
          hostname.includes('login.microsoftonline.com')) {
        console.log(`Certificate verification for OAuth provider: ${hostname}`);
      }
      
      // Use default behavior (0 = accept, anything else = reject)
      callback(0);
    });

    // Enhanced session settings for OAuth compatibility
    session.defaultSession.webRequest.onBeforeSendHeaders((details, callback) => {
      // Add headers that OAuth providers expect
      const headers = details.requestHeaders;
      
      // Ensure proper referer and origin headers for OAuth flows
      if (details.url.includes('accounts.google.com') || 
          details.url.includes('oauth') || 
          details.url.includes('auth')) {
        
        // Add standard browser headers that OAuth providers expect
        headers['sec-fetch-dest'] = 'document';
        headers['sec-fetch-mode'] = 'navigate';
        headers['sec-fetch-site'] = 'none';
        headers['sec-fetch-user'] = '?1';
        headers['upgrade-insecure-requests'] = '1';
        
        // Ensure proper accept headers
        if (!headers['accept']) {
          headers['accept'] = 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7';
        }
        
        if (!headers['accept-language']) {
          headers['accept-language'] = 'en-US,en;q=0.9';
        }
        
        if (!headers['accept-encoding']) {
          headers['accept-encoding'] = 'gzip, deflate, br';
        }
      }
      
      callback({ requestHeaders: headers });
    });

    // Configure dedicated sessions for different purposes
    const authSession = session.fromPartition('persist:auth-session');
    authSession.setUserAgent(userAgent);
    
    const compatSession = session.fromPartition('persist:compat-session');
    compatSession.setUserAgent(userAgent);

    // Set preload scripts if needed
    const preloadPath = path.join(__dirname, '../preload/preload.js');
    console.log('Setting preload path:', preloadPath);
    session.defaultSession.setPreloads([preloadPath]);
    authSession.setPreloads([preloadPath]);
    compatSession.setPreloads([preloadPath]);
  }

  public getAdBlocker(): AdBlocker {
    return this.adBlocker;
  }
} 