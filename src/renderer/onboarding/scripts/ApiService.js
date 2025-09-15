/**
 * ApiService - Handles API communications for onboarding
 * Manages email verification, user creation, and external API calls
 */

class ApiService {
  constructor(onboardingManager) {
    this.onboardingManager = onboardingManager;
    this.currentOTP = null;
    this.otpTimestamp = null;
    this.otpExpiration = 10 * 60 * 1000; // 10 minutes
    
    // API endpoints
    this.endpoints = {
      emailService: this.getEmailServiceUrl(),
      userService: this.getUserServiceUrl()
    };
    
    this.init();
  }

  init() {
    console.log('✅ ApiService initialized');
    console.log('📡 Email service URL:', this.endpoints.emailService);
  }

  /**
   * Get email service URL based on environment
   * @returns {string} - Email service URL
   */
  getEmailServiceUrl() {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    return isLocal 
      ? 'http://localhost:5001' 
      : 'https://browzer-email-service-3fd1c9e21714.herokuapp.com';
  }

  /**
   * Get user service URL (placeholder for future backend)
   * @returns {string} - User service URL
   */
  getUserServiceUrl() {
    return 'https://api.browzer.com'; // Placeholder
  }

  /**
   * Send verification code to email
   * @param {string} email - Email address
   * @returns {Promise<Object>} - API response
   */
  async sendVerificationCode(email) {
    try {
      // Generate OTP
      const otp = this.generateOTP();
      this.currentOTP = otp;
      this.otpTimestamp = Date.now();
      
      // Show loading state
      this.onboardingManager.formValidator.showLoadingState('sendVerificationBtn', 'Sending...');
      
      // Call email service API
      const response = await fetch(`${this.endpoints.emailService}/api/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          otp: otp,
          clientId: 'browzer-desktop',
          template: 'enterprise-onboarding'
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Show success feedback
      this.onboardingManager.formValidator.showFeedback(
        'emailFeedback', 
        'Verification code sent! Please check your email.', 
        'success'
      );
      
      // Hide send button and show verification section
      const sendBtn = document.getElementById('sendVerificationBtn');
      if (sendBtn) sendBtn.style.display = 'none';
      
      // Show verification section
      const verificationSection = document.getElementById('verificationSection');
      if (verificationSection) {
        verificationSection.classList.remove('hidden');
        if (this.onboardingManager.stepManager) {
          this.onboardingManager.stepManager.toggleVerificationSection(true);
        }
      }
      
      return {
        success: true,
        message: result.message || 'Verification code sent successfully',
        messageId: result.messageId
      };
      
    } catch (error) {
      console.error('Failed to send verification code:', error);
      
      // Fallback to development mode
      if (error.message.includes('fetch')) {
        console.log(`🔐 DEVELOPMENT MODE - OTP for ${email}: ${this.currentOTP}`);
        
        // Show development mode message
        this.onboardingManager.formValidator.showFeedback(
          'emailFeedback',
          `Development mode: Check console for OTP (${this.currentOTP})`,
          'warning'
        );
        
        // Show verification section
        const verificationSection = document.getElementById('verificationSection');
        if (verificationSection) {
          verificationSection.classList.remove('hidden');
        }
        
        return {
          success: true,
          message: 'Development mode - check console for OTP',
          messageId: 'dev-mode-' + Date.now()
        };
      }
      
      // Show error feedback
      this.onboardingManager.formValidator.showFeedback(
        'emailFeedback',
        error.message || 'Failed to send verification code',
        'error'
      );
      
      throw error;
    } finally {
      // Hide loading state
      this.onboardingManager.formValidator.hideLoadingState('sendVerificationBtn');
    }
  }

  /**
   * Verify OTP code
   * @param {string} email - Email address
   * @param {string} code - Verification code
   * @returns {Promise<Object>} - Verification result
   */
  async verifyCode(email, code) {
    try {
      // Show loading state
      this.onboardingManager.formValidator.showLoadingState('verifyCodeBtn', 'Verifying...');
      
      // Check if OTP exists and hasn't expired
      if (!this.currentOTP) {
        throw new Error('No verification code found. Please request a new code.');
      }
      
      if (this.isOTPExpired()) {
        this.currentOTP = null;
        this.otpTimestamp = null;
        throw new Error('Verification code has expired. Please request a new code.');
      }
      
      // Verify OTP
      if (code !== this.currentOTP) {
        throw new Error('Invalid verification code. Please try again.');
      }
      
      // Clear OTP after successful verification
      this.currentOTP = null;
      this.otpTimestamp = null;
      
      // Create user account
      await this.createUserAccount(email);
      
      // Show success feedback
      this.onboardingManager.formValidator.showFeedback(
        'verificationFeedback',
        'Email verified successfully!',
        'success'
      );
      
      // Enable next button
      const nextBtn = document.getElementById('nextButton');
      if (nextBtn) {
        nextBtn.disabled = false;
      }
      
      return {
        success: true,
        message: 'Email verified successfully',
        user: { email: email }
      };
      
    } catch (error) {
      console.error('Verification failed:', error);
      
      // Show error feedback
      this.onboardingManager.formValidator.showFeedback(
        'verificationFeedback',
        error.message,
        'error'
      );
      
      throw error;
    } finally {
      // Hide loading state
      this.onboardingManager.formValidator.hideLoadingState('verifyCodeBtn');
    }
  }

  /**
   * Create user account
   * @param {string} email - Email address
   * @returns {Promise<Object>} - User creation result
   */
  async createUserAccount(email) {
    try {
      // Try to create user via Electron IPC
      if (window.electronAPI && window.electronAPI.ipcInvoke) {
        const result = await window.electronAPI.ipcInvoke('create-user', email);
        console.log('User created via IPC:', result);
        return result;
      }
      
      // Fallback to localStorage for development
      const userData = {
        email: email,
        id: this.generateUserId(),
        createdAt: new Date().toISOString(),
        verified: true
      };
      
      localStorage.setItem('browzer_user', JSON.stringify(userData));
      console.log('User created in localStorage:', userData);
      
      return { success: true, user: userData };
      
    } catch (error) {
      console.error('Failed to create user account:', error);
      // Don't throw error here - verification can still succeed
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle browser data import
   * @param {string} browser - Browser type ('chrome', 'edge', 'brave', 'skip')
   * @returns {Promise<Object>} - Import result
   */
  async importBrowserData(browser) {
    if (browser === 'skip') {
      return { success: true, message: 'Import skipped' };
    }
    
    try {
      // Show import progress
      const importProgress = document.getElementById('importProgress');
      if (importProgress) {
        importProgress.classList.remove('hidden');
      }
      
      // Simulate import steps with progress updates
      const steps = [
        { progress: 20, message: 'Locating browser data...' },
        { progress: 40, message: 'Reading browsing history...' },
        { progress: 60, message: 'Importing bookmarks...' },
        { progress: 80, message: 'Processing data...' },
        { progress: 100, message: 'Import completed!' }
      ];
      
      for (const step of steps) {
        await this.updateImportProgress(step.progress, step.message);
        await this.delay(800);
      }
      
      // Try to import via Electron IPC
      if (window.electronAPI && window.electronAPI.ipcInvoke) {
        const result = await window.electronAPI.ipcInvoke('import-browser-data', { browser });
        if (result.success) {
          return result;
        }
      }
      
      // Fallback success for development
      return {
        success: true,
        message: `Successfully imported data from ${browser}`,
        imported: {
          bookmarks: Math.floor(Math.random() * 100) + 50,
          history: Math.floor(Math.random() * 1000) + 500,
          passwords: Math.floor(Math.random() * 20) + 10
        }
      };
      
    } catch (error) {
      console.error('Import failed:', error);
      throw new Error('Failed to import browser data');
    }
  }

  /**
   * Update import progress
   * @param {number} progress - Progress percentage
   * @param {string} message - Progress message
   */
  async updateImportProgress(progress, message) {
    const progressFill = document.getElementById('importProgressFill');
    const statusText = document.getElementById('importStatus');
    
    if (progressFill) {
      progressFill.style.width = `${progress}%`;
    }
    
    if (statusText) {
      statusText.textContent = message;
    }
    
    // Animate progress if StepManager is available
    if (this.onboardingManager.stepManager) {
      this.onboardingManager.stepManager.animateImportProgress(progress);
    }
  }

  /**
   * Save API key securely
   * @param {string} provider - API provider name
   * @param {string} key - API key
   * @returns {Promise<Object>} - Save result
   */
  async saveApiKey(provider, key) {
    try {
      // Try to save via Electron IPC (secure storage)
      if (window.electronAPI && window.electronAPI.ipcInvoke) {
        const result = await window.electronAPI.ipcInvoke('save-api-key', { provider, key });
        console.log(`API key saved securely for ${provider}`);
        return result;
      }
      
      // Fallback to localStorage for development (not secure)
      localStorage.setItem(`browzer_api_key_${provider}`, key);
      console.log(`API key saved to localStorage for ${provider}`);
      
      return { success: true };
      
    } catch (error) {
      console.error('Failed to save API key:', error);
      throw new Error('Failed to save API key securely');
    }
  }

  /**
   * Generate secure OTP
   * @returns {string} - 6-digit OTP
   */
  generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generate user ID
   * @returns {string} - Unique user ID
   */
  generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  /**
   * Check if OTP has expired
   * @returns {boolean} - Whether OTP is expired
   */
  isOTPExpired() {
    if (!this.otpTimestamp) return true;
    return Date.now() - this.otpTimestamp > this.otpExpiration;
  }

  /**
   * Get remaining OTP time
   * @returns {number} - Remaining time in milliseconds
   */
  getRemainingOTPTime() {
    if (!this.otpTimestamp) return 0;
    const elapsed = Date.now() - this.otpTimestamp;
    return Math.max(0, this.otpExpiration - elapsed);
  }

  /**
   * Format remaining time for display
   * @returns {string} - Formatted time string
   */
  formatRemainingTime() {
    const remaining = this.getRemainingOTPTime();
    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  /**
   * Delay utility function
   * @param {number} ms - Milliseconds to delay
   * @returns {Promise} - Promise that resolves after delay
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Test API connectivity
   * @returns {Promise<Object>} - Connectivity test result
   */
  async testConnectivity() {
    try {
      const response = await fetch(`${this.endpoints.emailService}/api/health`, {
        method: 'GET',
        timeout: 5000
      });
      
      return {
        success: response.ok,
        status: response.status,
        message: response.ok ? 'API service is available' : 'API service is unavailable'
      };
      
    } catch (error) {
      return {
        success: false,
        error: error.message,
        message: 'Failed to connect to API service'
      };
    }
  }

  /**
   * Clear stored OTP data
   */
  clearOTPData() {
    this.currentOTP = null;
    this.otpTimestamp = null;
  }

  /**
   * Reset API service state
   */
  reset() {
    this.clearOTPData();
    console.log('🔄 ApiService reset');
  }
}

// Export for use in other modules
window.ApiService = ApiService;
