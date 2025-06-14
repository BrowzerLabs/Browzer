/**
 * Page Enhancer - JavaScript Module Extension
 * 
 * This extension demonstrates how to create lightweight browser enhancements
 * using the Browzer Extension Framework.
 */

class PageEnhancer {
  constructor() {
    this.config = {};
    this.isInitialized = false;
    this.originalStyles = new Map();
  }

  async initialize() {
    try {
      // Load configuration
      this.config = await this.loadConfig();
      
      // Apply enhancements based on config
      if (this.config.enableDarkMode) {
        this.applyDarkMode();
      }
      
      if (this.config.fontSize !== 'medium') {
        this.adjustFontSize(this.config.fontSize);
      }
      
      // Add enhancement controls
      this.addControlPanel();
      
      // Set up event listeners
      this.setupEventListeners();
      
      this.isInitialized = true;
      console.log('[PageEnhancer] Extension initialized successfully');
      
    } catch (error) {
      console.error('[PageEnhancer] Initialization failed:', error);
    }
  }

  async loadConfig() {
    // In a real implementation, this would load from extension storage
    return {
      enableDarkMode: false,
      fontSize: 'medium',
      highlightColor: '#ffff00'
    };
  }

  applyDarkMode() {
    const darkModeCSS = `
      * {
        filter: invert(1) hue-rotate(180deg) !important;
      }
      
      img, video, iframe, canvas, svg {
        filter: invert(1) hue-rotate(180deg) !important;
      }
      
      [style*="background-image"] {
        filter: invert(1) hue-rotate(180deg) !important;
      }
    `;
    
    const style = document.createElement('style');
    style.id = 'page-enhancer-dark-mode';
    style.textContent = darkModeCSS;
    document.head.appendChild(style);
  }

  adjustFontSize(size) {
    const fontSizeMap = {
      'small': '0.9em',
      'medium': '1em',
      'large': '1.2em',
      'extra-large': '1.4em'
    };
    
    const fontSize = fontSizeMap[size] || '1em';
    
    const fontCSS = `
      * {
        font-size: ${fontSize} !important;
      }
    `;
    
    const style = document.createElement('style');
    style.id = 'page-enhancer-font-size';
    style.textContent = fontCSS;
    document.head.appendChild(style);
  }

  addControlPanel() {
    const panel = document.createElement('div');
    panel.id = 'page-enhancer-panel';
    panel.innerHTML = `
      <div class="pe-panel-header">
        <h3>Page Enhancer</h3>
        <button class="pe-toggle-btn" onclick="pageEnhancer.togglePanel()">−</button>
      </div>
      <div class="pe-panel-content">
        <div class="pe-control">
          <label>
            <input type="checkbox" id="pe-dark-mode" ${this.config.enableDarkMode ? 'checked' : ''}>
            Dark Mode
          </label>
        </div>
        <div class="pe-control">
          <label>Font Size:</label>
          <select id="pe-font-size">
            <option value="small" ${this.config.fontSize === 'small' ? 'selected' : ''}>Small</option>
            <option value="medium" ${this.config.fontSize === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="large" ${this.config.fontSize === 'large' ? 'selected' : ''}>Large</option>
            <option value="extra-large" ${this.config.fontSize === 'extra-large' ? 'selected' : ''}>Extra Large</option>
          </select>
        </div>
        <div class="pe-control">
          <button onclick="pageEnhancer.highlightLinks()">Highlight Links</button>
          <button onclick="pageEnhancer.focusMode()">Focus Mode</button>
        </div>
        <div class="pe-control">
          <button onclick="pageEnhancer.reset()">Reset</button>
        </div>
      </div>
    `;
    
    // Style the panel
    panel.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 250px;
      background: white;
      border: 2px solid #ccc;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      z-index: 10000;
      font-family: Arial, sans-serif;
      font-size: 14px;
    `;
    
    document.body.appendChild(panel);
  }

  setupEventListeners() {
    // Dark mode toggle
    const darkModeToggle = document.getElementById('pe-dark-mode');
    if (darkModeToggle) {
      darkModeToggle.addEventListener('change', (e) => {
        if (e.target.checked) {
          this.applyDarkMode();
        } else {
          this.removeDarkMode();
        }
        this.config.enableDarkMode = e.target.checked;
        this.saveConfig();
      });
    }
    
    // Font size selector
    const fontSizeSelect = document.getElementById('pe-font-size');
    if (fontSizeSelect) {
      fontSizeSelect.addEventListener('change', (e) => {
        this.adjustFontSize(e.target.value);
        this.config.fontSize = e.target.value;
        this.saveConfig();
      });
    }
  }

  togglePanel() {
    const panel = document.getElementById('page-enhancer-panel');
    const content = panel.querySelector('.pe-panel-content');
    const toggleBtn = panel.querySelector('.pe-toggle-btn');
    
    if (content.style.display === 'none') {
      content.style.display = 'block';
      toggleBtn.textContent = '−';
    } else {
      content.style.display = 'none';
      toggleBtn.textContent = '+';
    }
  }

  highlightLinks() {
    const links = document.querySelectorAll('a');
    links.forEach(link => {
      link.style.backgroundColor = this.config.highlightColor;
      link.style.padding = '2px 4px';
      link.style.borderRadius = '3px';
    });
    
    // Remove highlights after 5 seconds
    setTimeout(() => {
      links.forEach(link => {
        link.style.backgroundColor = '';
        link.style.padding = '';
        link.style.borderRadius = '';
      });
    }, 5000);
  }

  focusMode() {
    // Hide distracting elements
    const elementsToHide = document.querySelectorAll('aside, .sidebar, .ads, .advertisement, .social-share');
    elementsToHide.forEach(el => {
      el.style.display = 'none';
    });
    
    // Highlight main content
    const mainContent = document.querySelector('main, article, .content, .post, .entry');
    if (mainContent) {
      mainContent.style.border = `3px solid ${this.config.highlightColor}`;
      mainContent.style.padding = '20px';
    }
  }

  removeDarkMode() {
    const darkStyle = document.getElementById('page-enhancer-dark-mode');
    if (darkStyle) {
      darkStyle.remove();
    }
  }

  reset() {
    // Remove all applied styles
    const enhancerStyles = document.querySelectorAll('[id^="page-enhancer-"]');
    enhancerStyles.forEach(style => {
      if (style.id !== 'page-enhancer-panel') {
        style.remove();
      }
    });
    
    // Reset all modified elements
    document.querySelectorAll('*').forEach(el => {
      if (el.style.backgroundColor === this.config.highlightColor) {
        el.style.backgroundColor = '';
        el.style.padding = '';
        el.style.borderRadius = '';
      }
      if (el.style.border && el.style.border.includes(this.config.highlightColor)) {
        el.style.border = '';
        el.style.padding = '';
      }
    });
    
    // Show hidden elements
    document.querySelectorAll('[style*="display: none"]').forEach(el => {
      el.style.display = '';
    });
    
    // Reset configuration
    this.config = {
      enableDarkMode: false,
      fontSize: 'medium',
      highlightColor: '#ffff00'
    };
    
    // Update UI controls
    const darkModeToggle = document.getElementById('pe-dark-mode');
    const fontSizeSelect = document.getElementById('pe-font-size');
    
    if (darkModeToggle) darkModeToggle.checked = false;
    if (fontSizeSelect) fontSizeSelect.value = 'medium';
    
    this.saveConfig();
  }

  async saveConfig() {
    // In a real implementation, this would save to extension storage
    console.log('[PageEnhancer] Configuration saved:', this.config);
  }
}

// Initialize the extension
const pageEnhancer = new PageEnhancer();

// Wait for DOM to be ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => pageEnhancer.initialize());
} else {
  pageEnhancer.initialize();
}

// Make it globally accessible for button clicks
window.pageEnhancer = pageEnhancer; 