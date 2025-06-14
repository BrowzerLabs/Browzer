export class ExtensionStore {
  private container: HTMLElement;
  private apiBaseUrl = 'http://localhost:3001/api/v1';
  private authToken: string | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
    this.authToken = localStorage.getItem('browzer_store_token');
  }

  async render(): Promise<void> {
    this.container.innerHTML = `
      <div class="extension-store">
        <div class="store-header">
          <div class="store-logo">
            <h1>🧩 Browzer Extension Store</h1>
            <p>Discover and install extensions for your Browzer browser</p>
          </div>
          <div class="store-user-menu">
            <div class="upload-info">
              <span>Upload extensions without sign-in (testing mode)</span>
            </div>
          </div>
        </div>

        <div class="store-nav">
          <button class="nav-tab active" data-tab="featured">Featured</button>
          <button class="nav-tab" data-tab="all">All Extensions</button>
          <button class="nav-tab" data-tab="installed">Installed</button>
          <button class="nav-tab" data-tab="developer">Developer</button>
        </div>

        <div class="store-content">
          <div class="tab-content active" id="featured-tab">
            <div class="loading-spinner">Loading featured extensions...</div>
          </div>
          
          <div class="tab-content" id="all-tab">
            <div class="search-bar">
              <input type="text" id="extension-search" placeholder="Search extensions...">
              <button id="search-btn">Search</button>
            </div>
            <div class="extensions-grid">
              <div class="loading-spinner">Loading extensions...</div>
            </div>
          </div>
          
          <div class="tab-content" id="installed-tab">
            <div class="installed-extensions">
              <div class="loading-spinner">Loading installed extensions...</div>
            </div>
          </div>
          
          <div class="tab-content" id="developer-tab">
            ${this.renderDeveloperPanel()}
          </div>
        </div>

        <!-- Modals -->
        <div id="extension-modal" class="modal hidden">
          <div class="modal-content">
            <span class="close">&times;</span>
            <div class="modal-body"></div>
          </div>
        </div>

        <div id="auth-modal" class="modal hidden">
          <div class="modal-content">
            <span class="close">&times;</span>
            <div class="auth-form">
              <h3>Sign In to Browzer Store</h3>
              <form id="login-form">
                <input type="email" id="email" placeholder="Email" required>
                <input type="password" id="password" placeholder="Password" required>
                <button type="submit">Sign In</button>
                <button type="button" id="show-register">Create Account</button>
              </form>
              <form id="register-form" class="hidden">
                <input type="text" id="reg-username" placeholder="Username" required>
                <input type="email" id="reg-email" placeholder="Email" required>
                <input type="password" id="reg-password" placeholder="Password" required>
                <button type="submit">Create Account</button>
                <button type="button" id="show-login">Back to Sign In</button>
              </form>
            </div>
          </div>
        </div>

        <!-- Progress Modal -->
        <div class="progress-overlay hidden" id="progress-overlay"></div>
        <div class="extension-progress hidden" id="extension-progress">
          <div class="progress-title" id="progress-title">Processing...</div>
          <div class="progress-step" id="progress-step">Initializing...</div>
          <div class="progress-bar-container">
            <div class="progress-bar" id="progress-bar"></div>
          </div>
          <div class="progress-percentage" id="progress-percentage">0%</div>
        </div>
      </div>
    `;

    this.setupEventListeners();
    this.loadFeaturedExtensions();
  }

  private renderUserMenu(): string {
    return `
      <div class="user-menu">
        <button id="user-profile">Profile</button>
        <button id="logout">Sign Out</button>
      </div>
    `;
  }

  private renderAuthButtons(): string {
    return `
      <div class="auth-buttons">
        <button id="login-btn">Sign In</button>
        <button id="register-btn">Create Account</button>
      </div>
    `;
  }

  private renderDeveloperPanel(): string {
    return `
      <div class="developer-panel">
        <h3>Developer Dashboard <span class="testing-badge">Testing Mode - No Auth Required</span></h3>
        <div class="dev-actions">
          <button id="upload-extension" class="primary-btn">Upload Extension</button>
        </div>
        <div class="upload-form">
          <h4>Upload New Extension</h4>
          <form id="extension-upload-form" enctype="multipart/form-data">
            <input type="file" id="extension-file" accept=".bzx,.zip,.crx" required>
            <input type="text" id="extension-name" placeholder="Extension Name" required>
            <textarea id="extension-description" placeholder="Description" required></textarea>
            <select id="extension-category" required>
              <option value="">Select Category</option>
              <option value="productivity">Productivity</option>
              <option value="developer">Developer Tools</option>
              <option value="entertainment">Entertainment</option>
              <option value="utility">Utility</option>
              <option value="social">Social</option>
            </select>
            <input type="text" id="extension-version" placeholder="Version (e.g., 1.0.0)" value="1.0.0" required>
            <button type="submit">Upload Extension</button>
          </form>
        </div>
        <div class="upload-instructions">
          <h4>How to Upload Extensions:</h4>
          <ol>
            <li>Select your extension file (.bzx, .zip, or .crx)</li>
            <li>Fill in the extension details</li>
            <li>Click "Upload Extension"</li>
            <li>Your extension will be automatically approved and available immediately</li>
          </ol>
        </div>
      </div>
    `;
  }

  private renderLoginPrompt(): string {
    return `
      <div class="login-prompt">
        <h3>Developer Access</h3>
        <p>Sign in to upload and manage your extensions.</p>
        <button id="dev-login-btn" class="primary-btn">Sign In</button>
      </div>
    `;
  }

  private setupEventListeners(): void {
    // Tab navigation
    const navTabs = this.container.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        const tabName = target.dataset.tab;
        this.switchTab(tabName!);
      });
    });

    // Auth buttons
    const loginBtn = this.container.querySelector('#login-btn');
    const registerBtn = this.container.querySelector('#register-btn');
    const devLoginBtn = this.container.querySelector('#dev-login-btn');
    
    [loginBtn, registerBtn, devLoginBtn].forEach(btn => {
      btn?.addEventListener('click', () => this.showAuthModal());
    });

    // Modal handling
    this.setupModalListeners();

    // Search
    const searchBtn = this.container.querySelector('#search-btn');
    const searchInput = this.container.querySelector('#extension-search') as HTMLInputElement;
    
    searchBtn?.addEventListener('click', () => this.searchExtensions(searchInput?.value || ''));
    searchInput?.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        this.searchExtensions(searchInput.value);
      }
    });

    // Upload form
    const uploadForm = this.container.querySelector('#extension-upload-form') as HTMLFormElement;
    uploadForm?.addEventListener('submit', (e) => this.handleUpload(e));
  }

  private switchTab(tabName: string): void {
    // Remove active class from all tabs and content
    this.container.querySelectorAll('.nav-tab').forEach(tab => tab.classList.remove('active'));
    this.container.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    // Add active class to selected tab and content
    const selectedTab = this.container.querySelector(`[data-tab="${tabName}"]`);
    const selectedContent = this.container.querySelector(`#${tabName}-tab`);
    
    selectedTab?.classList.add('active');
    selectedContent?.classList.add('active');

    // Load content based on tab
    switch (tabName) {
      case 'all':
        this.loadAllExtensions();
        break;
      case 'installed':
        this.loadInstalledExtensions();
        break;
      case 'developer':
        if (this.authToken) {
          this.loadDeveloperExtensions();
        }
        break;
    }
  }

  private async loadFeaturedExtensions(): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/extensions?featured=true`);
      const data = await response.json();
      
      console.log('Featured extensions data:', data); // Debug log
      
      const featuredTab = this.container.querySelector('#featured-tab');
      if (featuredTab) {
        featuredTab.innerHTML = this.renderExtensionGrid(data.data || data.extensions || []);
      }
    } catch (error) {
      console.error('Failed to load featured extensions:', error);
      this.showError('Failed to load featured extensions');
    }
  }

  private async loadAllExtensions(): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/extensions`);
      const data = await response.json();
      
      console.log('All extensions data:', data); // Debug log
      
      const extensionsGrid = this.container.querySelector('.extensions-grid');
      if (extensionsGrid) {
        extensionsGrid.innerHTML = this.renderExtensionGrid(data.data || data.extensions || []);
      }
    } catch (error) {
      console.error('Failed to load extensions:', error);
      this.showError('Failed to load extensions');
    }
  }

  private async searchExtensions(query: string): Promise<void> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/extensions?q=${encodeURIComponent(query)}`);
      const data = await response.json();
      
      const extensionsGrid = this.container.querySelector('.extensions-grid');
      if (extensionsGrid) {
        extensionsGrid.innerHTML = this.renderExtensionGrid(data.data || data.extensions || []);
      }
    } catch (error) {
      console.error('Failed to search extensions:', error);
      this.showError('Failed to search extensions');
    }
  }

  private async loadInstalledExtensions(): Promise<void> {
    try {
      // Get installed extensions from the main process
      const { ipcRenderer } = require('electron');
      const installedExtensions = await ipcRenderer.invoke('get-installed-extensions');
      
      const installedTab = this.container.querySelector('.installed-extensions');
      if (installedTab) {
        installedTab.innerHTML = this.renderInstalledExtensions(installedExtensions || []);
      }
    } catch (error) {
      console.error('Failed to load installed extensions:', error);
      this.showError('Failed to load installed extensions');
    }
  }

  private renderExtensionGrid(extensions: any[]): string {
    if (!extensions || extensions.length === 0) {
      return '<div class="no-results">No extensions found</div>';
    }

    const escapeHtml = (str: string) => str.replace(/[<>&"]/g, (c) => {
      const escapeMap: { [key: string]: string } = {
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;',
        '"': '&quot;'
      };
      return escapeMap[c] || c;
    });

    return extensions.map(ext => {
      // Safely escape HTML content
      const name = escapeHtml(ext.name || '');
      const description = escapeHtml(ext.description || ext.shortDesc || 'No description available');
      const author = escapeHtml(ext.owner?.username || ext.author?.username || 'Unknown');
      
      // Simple fallback icon
      const iconUrl = ext.iconUrl || '/assets/default-extension-icon.png';
      
      return `
        <div class="extension-card" data-id="${ext.id}">
          <div class="extension-icon">
            <img src="${iconUrl}" alt="${name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='block';" />
            <div class="icon-fallback" style="display: none; width: 48px; height: 48px; background: #f0f0f0; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 24px;">🧩</div>
          </div>
          <div class="extension-info">
            <h3>${name}</h3>
            <p class="extension-author">by ${author}</p>
            <p class="extension-description">${description}</p>
            <div class="extension-meta">
              <span class="version">v${ext.versions?.[0]?.semver || ext.version || '1.0.0'}</span>
              <span class="downloads">${ext.downloads || 0} downloads</span>
              <span class="rating">★ ${ext.rating || 'N/A'}</span>
            </div>
          </div>
          <div class="extension-actions">
            <button class="install-btn" onclick="extensionStore.installExtension('${ext.id}')">
              Install
            </button>
            <button class="details-btn" onclick="extensionStore.showExtensionDetails('${ext.id}')">
              Details
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  private renderInstalledExtensions(extensions: any[]): string {
    if (extensions.length === 0) {
      return '<div class="no-results">No extensions installed</div>';
    }

    return `
      <div class="installed-extensions-grid">
        ${extensions.map(ext => `
          <div class="installed-extension-card">
            <div class="extension-icon">
              <img src="${ext.iconUrl || '/assets/default-extension-icon.png'}" alt="${ext.name}" />
            </div>
            <div class="extension-info">
              <h3>${ext.name}</h3>
              <p class="extension-version">Version ${ext.version}</p>
              <p class="extension-status ${ext.enabled ? 'enabled' : 'disabled'}">
                ${ext.enabled ? 'Enabled' : 'Disabled'}
              </p>
            </div>
            <div class="extension-actions">
              <button onclick="extensionStore.toggleExtension('${ext.id}', ${!ext.enabled})">
                ${ext.enabled ? 'Disable' : 'Enable'}
              </button>
              <button onclick="extensionStore.uninstallExtension('${ext.id}')">
                Uninstall
              </button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private setupModalListeners(): void {
    const modals = this.container.querySelectorAll('.modal');
    modals.forEach(modal => {
      const closeBtn = modal.querySelector('.close');
      closeBtn?.addEventListener('click', () => {
        modal.classList.add('hidden');
      });

      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          modal.classList.add('hidden');
        }
      });
    });
  }

  private showAuthModal(): void {
    const authModal = this.container.querySelector('#auth-modal');
    authModal?.classList.remove('hidden');
  }

  private setupAuthForms(): void {
    const loginForm = this.container.querySelector('#login-form');
    const registerForm = this.container.querySelector('#register-form');
    const showRegisterBtn = this.container.querySelector('#show-register');
    const showLoginBtn = this.container.querySelector('#show-login');

    showRegisterBtn?.addEventListener('click', () => {
      loginForm?.classList.add('hidden');
      registerForm?.classList.remove('hidden');
    });

    showLoginBtn?.addEventListener('click', () => {
      registerForm?.classList.add('hidden');
      loginForm?.classList.remove('hidden');
    });

    // Authentication disabled for testing
  }

  private async handleUpload(e: Event): Promise<void> {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData();
    
    // Get form fields
    const fileInput = form.querySelector('#extension-file') as HTMLInputElement;
    const nameInput = form.querySelector('#extension-name') as HTMLInputElement;
    const descInput = form.querySelector('#extension-description') as HTMLTextAreaElement;
    const categoryInput = form.querySelector('#extension-category') as HTMLSelectElement;
    const versionInput = form.querySelector('#extension-version') as HTMLInputElement;
    
    if (!fileInput.files?.[0]) {
      this.showError('Please select an extension file');
      return;
    }
    
    if (!nameInput.value || !descInput.value || !categoryInput.value || !versionInput.value) {
      this.showError('Please fill in all required fields');
      return;
    }
    
    // Append file and form data
    formData.append('file', fileInput.files[0]);
    formData.append('name', nameInput.value);
    formData.append('description', descInput.value);
    formData.append('category', categoryInput.value);
    formData.append('version', versionInput.value);
    
    try {
      this.showProgress('Uploading Extension');
      
      // Step 1: Preparing upload
      this.updateProgress(15, 'Preparing upload...');
      await this.delay(300);
      
      // Step 2: Uploading file
      this.updateProgress(30, 'Uploading extension file...');
      await this.delay(400);
      
      const response = await fetch(`${this.apiBaseUrl}/extensions/upload`, {
        method: 'POST',
        body: formData
      });
      
      // Step 3: Processing
      this.updateProgress(70, 'Processing extension...');
      await this.delay(500);
      
      const data = await response.json();
      
      if (response.ok) {
        // Step 4: Finalizing
        this.updateProgress(95, 'Finalizing upload...');
        await this.delay(400);
        
        this.updateProgress(100, 'Upload complete!');
        await this.delay(800);
        
        this.hideProgress();
        this.showSuccess(`Extension "${data.extension.name}" uploaded successfully!`);
        form.reset();
        
        // Refresh the featured/all extensions tabs
        this.loadFeaturedExtensions();
        this.loadAllExtensions();
      } else {
        this.hideProgress();
        this.showError(data.message || 'Upload failed');
      }
    } catch (error) {
      this.hideProgress();
      console.error('Upload error:', error);
      this.showError('Upload failed');
    }
  }

  async installExtension(extensionId: string): Promise<void> {
    try {
      this.showProgress('Installing Extension');
      
      // Step 1: Get download URL
      this.updateProgress(10, 'Getting download information...');
      await this.delay(300);
      
      const response = await fetch(`${this.apiBaseUrl}/extensions/${extensionId}/download`);
      if (!response.ok) {
        throw new Error(`Download failed: ${response.status} ${response.statusText}`);
      }
      
      const downloadInfo = await response.json();
      console.log('Download info:', downloadInfo);
      
      // Step 2: Download file
      this.updateProgress(30, 'Downloading extension files...');
      await this.delay(500);
      
      const fileResponse = await fetch(downloadInfo.downloadUrl);
      if (!fileResponse.ok) {
        throw new Error(`File download failed: ${fileResponse.status} ${fileResponse.statusText}`);
      }
      
      const blob = await fileResponse.blob();
      const arrayBuffer = await blob.arrayBuffer();
      
      // Step 3: Prepare installation
      this.updateProgress(60, 'Preparing installation...');
      await this.delay(300);
      
      const { ipcRenderer } = require('electron');
      
      // Step 4: Install extension
      this.updateProgress(75, 'Installing extension...');
      await this.delay(300);
      
      const result = await ipcRenderer.invoke('install-extension-from-store', {
        extensionId,
        data: Array.from(new Uint8Array(arrayBuffer))
      });
      
      if (result.success) {
        // Step 5: Finalizing
        this.updateProgress(95, 'Finalizing installation...');
        await this.delay(500);
        
        this.updateProgress(100, 'Installation complete!');
        await this.delay(800);
        
        this.hideProgress();
        this.showSuccess('Extension installed successfully!');
        
        // Refresh installed extensions if on that tab
        const installedTab = this.container.querySelector('#installed-tab.active');
        if (installedTab) {
          this.loadInstalledExtensions();
        }
      } else {
        this.hideProgress();
        this.showError(result.error || 'Installation failed');
      }
    } catch (error) {
      this.hideProgress();
      console.error('Installation error:', error);
      this.showError(`Installation failed: ${(error as Error).message}`);
    }
  }

  async toggleExtension(extensionId: string, enable: boolean): Promise<void> {
    try {
      const { ipcRenderer } = require('electron');
      const result = await ipcRenderer.invoke('toggle-extension', extensionId, enable);
      
      if (result.success) {
        this.showSuccess(`Extension ${enable ? 'enabled' : 'disabled'} successfully`);
        this.loadInstalledExtensions();
      } else {
        this.showError(result.error || 'Operation failed');
      }
    } catch (error) {
      console.error('Toggle extension error:', error);
      this.showError('Operation failed');
    }
  }

  async uninstallExtension(extensionId: string): Promise<void> {
    if (!confirm('Are you sure you want to uninstall this extension?')) {
      return;
    }

    try {
      this.showProgress('Uninstalling Extension');
      
      // Step 1: Preparing uninstall
      this.updateProgress(10, 'Preparing to uninstall...');
      await this.delay(300);
      
      // Step 2: Removing from system
      this.updateProgress(30, 'Removing from browser session...');
      await this.delay(400);
      
      // Step 3: Cleaning up files
      this.updateProgress(60, 'Cleaning up extension files...');
      await this.delay(500);
      
      const { ipcRenderer } = require('electron');
      const result = await ipcRenderer.invoke('uninstall-extension', extensionId);
      
      if (result.success) {
        // Step 4: Updating configuration
        this.updateProgress(85, 'Updating configuration...');
        await this.delay(400);
        
        // Step 5: Finalizing
        this.updateProgress(100, 'Uninstall complete!');
        await this.delay(800);
        
        this.hideProgress();
        this.showSuccess('Extension uninstalled successfully');
        this.loadInstalledExtensions();
      } else {
        this.hideProgress();
        this.showError(result.error || 'Uninstallation failed');
      }
    } catch (error) {
      this.hideProgress();
      console.error('Uninstall error:', error);
      this.showError('Uninstallation failed');
    }
  }

  showExtensionDetails(extensionId: string): void {
    // Implementation for showing extension details modal
    console.log('Show details for extension:', extensionId);
  }

  private toggleUploadForm(): void {
    const uploadForm = this.container.querySelector('.upload-form');
    uploadForm?.classList.toggle('hidden');
  }

  private async loadDeveloperExtensions(): Promise<void> {
    if (!this.authToken) return;

    try {
      const response = await fetch(`${this.apiBaseUrl}/extensions/my`, {
        headers: { 'Authorization': `Bearer ${this.authToken}` }
      });
      const data = await response.json();
      
      const myExtensionsDiv = this.container.querySelector('#my-extensions');
      if (myExtensionsDiv) {
        myExtensionsDiv.innerHTML = this.renderDeveloperExtensions(data.extensions || []);
      }
    } catch (error) {
      console.error('Failed to load developer extensions:', error);
      this.showError('Failed to load your extensions');
    }
  }

  private renderDeveloperExtensions(extensions: any[]): string {
    if (extensions.length === 0) {
      return '<div class="no-results">You haven\'t uploaded any extensions yet</div>';
    }

    return `
      <div class="developer-extensions">
        <h4>My Extensions</h4>
        ${extensions.map(ext => `
          <div class="dev-extension-card">
            <div class="extension-info">
              <h5>${ext.name}</h5>
              <p>Version ${ext.version} • ${ext.downloadCount} downloads</p>
              <p>Status: <span class="status ${ext.approved ? 'approved' : 'pending'}">${ext.approved ? 'Approved' : 'Pending Review'}</span></p>
            </div>
            <div class="extension-actions">
              <button onclick="extensionStore.editExtension('${ext.id}')">Edit</button>
              <button onclick="extensionStore.deleteExtension('${ext.id}')">Delete</button>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  private showError(message: string): void {
    // Use the main app's toast function
    (window as any).showToast?.(message, 'error') || console.error(message);
  }

  private showSuccess(message: string): void {
    // Use the main app's toast function
    (window as any).showToast?.(message, 'success') || console.log(message);
  }

  private showProgress(title: string): void {
    const overlay = this.container.querySelector('#progress-overlay');
    const progressModal = this.container.querySelector('#extension-progress');
    const titleElement = this.container.querySelector('#progress-title');
    
    if (titleElement) titleElement.textContent = title;
    
    overlay?.classList.remove('hidden');
    progressModal?.classList.remove('hidden');
    
    this.updateProgress(0, 'Initializing...');
  }

  private updateProgress(percentage: number, step: string): void {
    const progressBar = this.container.querySelector('#progress-bar') as HTMLElement;
    const stepElement = this.container.querySelector('#progress-step');
    const percentageElement = this.container.querySelector('#progress-percentage');
    
    if (progressBar) progressBar.style.width = `${percentage}%`;
    if (stepElement) stepElement.textContent = step;
    if (percentageElement) percentageElement.textContent = `${Math.round(percentage)}%`;
  }

  private hideProgress(): void {
    const overlay = this.container.querySelector('#progress-overlay');
    const progressModal = this.container.querySelector('#extension-progress');
    
    overlay?.classList.add('hidden');
    progressModal?.classList.add('hidden');
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Make it globally available for onclick handlers
(window as any).extensionStore = null; 