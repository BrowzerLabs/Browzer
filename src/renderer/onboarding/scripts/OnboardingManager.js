/**
 * OnboardingManager - Main controller for the onboarding flow
 * Handles step navigation, data persistence, and overall flow management
 */

class OnboardingManager {
  constructor() {
    this.currentStep = 1;
    this.totalSteps = 6;
    this.isTransitioning = false;
    
    // User data storage
    this.userData = {
      email: '',
      verified: false,
      preferences: {
        sidebar: true,
        adblock: true
      },
      importData: {
        browser: null,
        completed: false
      },
      apiKeys: {},
      setupComplete: false
    };
    
    // Initialize managers
    this.stepManager = null;
    this.formValidator = null;
    this.apiService = null;
    
    this.init();
  }

  async init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setup());
    } else {
      this.setup();
    }
  }

  setup() {
    // Initialize sub-managers
    this.stepManager = new StepManager(this);
    this.formValidator = new FormValidator(this);
    this.apiService = new ApiService(this);
    
    // Setup event listeners
    this.setupEventListeners();
    
    // Initialize UI
    this.updateProgressBar();
    this.updateStepCounter();
    this.updateNavigationButtons();
    
    // Load any existing data
    this.loadUserData();
    
    console.log('✅ OnboardingManager initialized');
  }

  setupEventListeners() {
    // Navigation buttons
    const prevBtn = document.getElementById('prevButton');
    const nextBtn = document.getElementById('nextButton');
    const skipBtn = document.getElementById('skipButton');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => this.previousStep());
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => this.nextStep());
    }
    
    if (skipBtn) {
      skipBtn.addEventListener('click', () => this.showSkipConfirmation());
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.showSkipConfirmation();
      }
    });

    // Step-specific event listeners
    this.setupStepEventListeners();
  }

  setupStepEventListeners() {
    // Step 2: Account setup
    const sendVerificationBtn = document.getElementById('sendVerificationBtn');
    const verifyCodeBtn = document.getElementById('verifyCodeBtn');
    const resendCodeBtn = document.getElementById('resendCodeBtn');

    if (sendVerificationBtn) {
      sendVerificationBtn.addEventListener('click', () => this.handleSendVerification());
    }
    
    if (verifyCodeBtn) {
      verifyCodeBtn.addEventListener('click', () => this.handleVerifyCode());
    }
    
    if (resendCodeBtn) {
      resendCodeBtn.addEventListener('click', () => this.handleResendCode());
    }

    // Step 3: Preferences
    const sidebarToggle = document.getElementById('sidebarToggle');
    const adBlockToggle = document.getElementById('adBlockToggle');

    if (sidebarToggle) {
      sidebarToggle.addEventListener('change', (e) => {
        this.userData.preferences.sidebar = e.target.checked;
        this.saveUserData();
      });
    }
    
    if (adBlockToggle) {
      adBlockToggle.addEventListener('change', (e) => {
        this.userData.preferences.adblock = e.target.checked;
        this.saveUserData();
      });
    }

    // Step 4: Import options
    const importCards = document.querySelectorAll('.import-card');
    importCards.forEach(card => {
      card.addEventListener('click', () => this.selectImportOption(card));
    });

    // Step 5: API configuration
    const anthropicKey = document.getElementById('anthropicKey');
    const apiHelpLink = document.getElementById('apiHelpLink');

    if (anthropicKey) {
      anthropicKey.addEventListener('input', (e) => {
        this.handleApiKeyInput(e.target.value);
      });
    }
    
    if (apiHelpLink) {
      apiHelpLink.addEventListener('click', (e) => {
        e.preventDefault();
        this.showApiHelp();
      });
    }

    // Step 6: Final actions
    const openSettingsBtn = document.getElementById('openSettingsBtn');
    const launchBrowserBtn = document.getElementById('launchBrowserBtn');

    if (openSettingsBtn) {
      openSettingsBtn.addEventListener('click', () => this.openSettings());
    }
    
    if (launchBrowserBtn) {
      launchBrowserBtn.addEventListener('click', () => this.completOnboarding());
    }
  }

  // Navigation methods
  async nextStep() {
    if (this.isTransitioning) return;
    
    // Validate current step
    const isValid = await this.validateCurrentStep();
    if (!isValid) return;
    
    if (this.currentStep < this.totalSteps) {
      await this.goToStep(this.currentStep + 1);
    }
  }

  async previousStep() {
    if (this.isTransitioning || this.currentStep <= 1) return;
    
    await this.goToStep(this.currentStep - 1);
  }

  async goToStep(stepNumber) {
    if (this.isTransitioning || stepNumber === this.currentStep) return;
    
    this.isTransitioning = true;
    
    try {
      // Use StepManager to handle the transition
      await this.stepManager.transitionToStep(stepNumber);
      
      this.currentStep = stepNumber;
      this.updateProgressBar();
      this.updateStepCounter();
      this.updateNavigationButtons();
      
      // Handle step-specific logic
      await this.handleStepEnter(stepNumber);
      
    } catch (error) {
      console.error('Step transition failed:', error);
    } finally {
      this.isTransitioning = false;
    }
  }

  async validateCurrentStep() {
    switch (this.currentStep) {
      case 1: // Welcome
        return true;
        
      case 2: // Account setup
        const email = document.getElementById('email')?.value;
        if (!email || !this.formValidator.validateEmail(email)) {
          this.formValidator.showFeedback('emailFeedback', 'Please enter a valid email address', 'error');
          return false;
        }
        
        if (!this.userData.verified) {
          this.formValidator.showFeedback('verificationFeedback', 'Please verify your email address first', 'error');
          return false;
        }
        
        return true;
        
      case 3: // Preferences
        this.savePreferencesToStorage();
        return true;
        
      case 4: // Import
        if (this.userData.importData.browser === null) {
          // Show visual feedback for import selection
          const importOptions = document.querySelector('.import-options');
          if (importOptions) {
            importOptions.style.border = '2px solid var(--error-500)';
            importOptions.style.borderRadius = 'var(--radius-lg)';
            
            // Create temporary error message
            let errorMsg = document.querySelector('.import-error-msg');
            if (!errorMsg) {
              errorMsg = document.createElement('div');
              errorMsg.className = 'import-error-msg';
              errorMsg.style.cssText = `
                color: var(--error-600);
                font-size: var(--font-size-sm);
                font-weight: var(--font-weight-medium);
                text-align: center;
                margin-top: var(--space-4);
                padding: var(--space-3);
                background: var(--error-50);
                border-radius: var(--radius-md);
                border: 1px solid var(--error-200);
              `;
              errorMsg.textContent = 'Please select an import option to continue';
              importOptions.parentNode.insertBefore(errorMsg, importOptions.nextSibling);
            }
            
            setTimeout(() => {
              importOptions.style.border = '';
              importOptions.style.borderRadius = '';
              if (errorMsg && errorMsg.parentNode) {
                errorMsg.remove();
              }
            }, 5000);
          }
          return false;
        }
        return true;
        
      case 5: // API setup
        const apiKey = document.getElementById('anthropicKey')?.value;
        if (apiKey && !this.formValidator.validateApiKey(apiKey)) {
          this.formValidator.showFeedback('anthropicFeedback', 'Please enter a valid API key or leave empty', 'error');
          return false;
        }
        
        if (apiKey) {
          this.userData.apiKeys.anthropic = apiKey;
          this.saveApiKey('anthropic', apiKey);
        }
        return true;
        
      case 6: // Complete
        return true;
        
      default:
        return true;
    }
  }

  async handleStepEnter(stepNumber) {
    switch (stepNumber) {
      case 1:
        // Welcome step - no special handling needed
        break;
        
      case 2:
        // Account setup - focus on email input
        setTimeout(() => {
          const emailInput = document.getElementById('email');
          if (emailInput) emailInput.focus();
        }, 300);
        break;
        
      case 3:
        // Preferences - load saved preferences
        this.loadPreferencesFromStorage();
        break;
        
      case 4:
        // Import - reset selection
        this.resetImportSelection();
        break;
        
      case 5:
        // API setup - load saved keys
        this.loadSavedApiKeys();
        break;
        
      case 6:
        // Completion - prepare final data
        this.prepareCompletionData();
        break;
    }
  }

  // UI Update methods
  updateProgressBar() {
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
      const progress = (this.currentStep / this.totalSteps) * 100;
      progressFill.style.width = `${progress}%`;
    }
  }

  updateStepCounter() {
    const currentStepEl = document.getElementById('currentStep');
    const totalStepsEl = document.getElementById('totalSteps');
    
    if (currentStepEl) currentStepEl.textContent = this.currentStep;
    if (totalStepsEl) totalStepsEl.textContent = this.totalSteps;
  }

  updateNavigationButtons() {
    const prevBtn = document.getElementById('prevButton');
    const nextBtn = document.getElementById('nextButton');
    
    if (prevBtn) {
      prevBtn.disabled = this.currentStep <= 1;
    }
    
    if (nextBtn) {
      if (this.currentStep === this.totalSteps) {
        nextBtn.style.display = 'none';
      } else {
        nextBtn.style.display = 'block';
        nextBtn.textContent = this.currentStep === this.totalSteps - 1 ? 'Complete' : 'Continue';
        
        // Disable next button for step 2 if not verified
        if (this.currentStep === 2 && !this.userData.verified) {
          nextBtn.disabled = true;
          nextBtn.style.opacity = '0.5';
        } else {
          nextBtn.disabled = false;
          nextBtn.style.opacity = '1';
        }
      }
    }
  }

  // Data management
  saveUserData() {
    try {
      localStorage.setItem('browzer_onboarding_data', JSON.stringify(this.userData));
    } catch (error) {
      console.error('Failed to save user data:', error);
    }
  }

  loadUserData() {
    try {
      const saved = localStorage.getItem('browzer_onboarding_data');
      if (saved) {
        this.userData = { ...this.userData, ...JSON.parse(saved) };
      }
    } catch (error) {
      console.error('Failed to load user data:', error);
    }
  }

  savePreferencesToStorage() {
    // Save to localStorage for main app to read
    localStorage.setItem('sidebarEnabled', this.userData.preferences.sidebar.toString());
    localStorage.setItem('adBlockEnabled', this.userData.preferences.adblock.toString());
    
    console.log('Preferences saved:', this.userData.preferences);
  }

  loadPreferencesFromStorage() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const adBlockToggle = document.getElementById('adBlockToggle');
    
    if (sidebarToggle) {
      sidebarToggle.checked = this.userData.preferences.sidebar;
    }
    
    if (adBlockToggle) {
      adBlockToggle.checked = this.userData.preferences.adblock;
    }
  }

  // Event handlers
  async handleSendVerification() {
    const email = document.getElementById('email')?.value;
    if (!email || !this.formValidator.validateEmail(email)) {
      this.formValidator.showFeedback('emailFeedback', 'Please enter a valid email address', 'error');
      return;
    }

    try {
      await this.apiService.sendVerificationCode(email);
      this.userData.email = email;
      this.saveUserData();
      
      // Show verification section
      const verificationSection = document.getElementById('verificationSection');
      if (verificationSection) {
        verificationSection.classList.remove('hidden');
        verificationSection.classList.add('animate-fadeInUp');
      }
      
      // Focus verification input
      setTimeout(() => {
        const verificationInput = document.getElementById('verificationCode');
        if (verificationInput) verificationInput.focus();
      }, 300);
      
    } catch (error) {
      this.formValidator.showFeedback('emailFeedback', error.message, 'error');
    }
  }

  async handleVerifyCode() {
    const code = document.getElementById('verificationCode')?.value;
    if (!code || code.length !== 6) {
      this.formValidator.showFeedback('verificationFeedback', 'Please enter a 6-digit code', 'error');
      return;
    }

    try {
      await this.apiService.verifyCode(this.userData.email, code);
      this.userData.verified = true;
      this.saveUserData();
      
      this.formValidator.showFeedback('verificationFeedback', 'Email verified successfully!', 'success');
      
      // Update navigation buttons to enable next step
      this.updateNavigationButtons();
      
    } catch (error) {
      this.formValidator.showFeedback('verificationFeedback', error.message, 'error');
    }
  }

  async handleResendCode() {
    if (!this.userData.email) return;
    
    try {
      await this.apiService.sendVerificationCode(this.userData.email);
      this.formValidator.showFeedback('emailFeedback', 'Verification code resent!', 'success');
    } catch (error) {
      this.formValidator.showFeedback('emailFeedback', error.message, 'error');
    }
  }

  selectImportOption(card) {
    // Remove previous selections
    document.querySelectorAll('.import-card').forEach(c => c.classList.remove('selected'));
    
    // Select current card
    card.classList.add('selected');
    
    // Update radio button
    const radio = card.querySelector('.import-radio');
    if (radio) {
      radio.checked = true;
      this.userData.importData.browser = radio.value;
      this.saveUserData();
    }
    
    // Clear any error styling and messages
    const importOptions = document.querySelector('.import-options');
    if (importOptions) {
      importOptions.style.border = '';
      importOptions.style.borderRadius = '';
    }
    
    const errorMsg = document.querySelector('.import-error-msg');
    if (errorMsg && errorMsg.parentNode) {
      errorMsg.remove();
    }
  }

  resetImportSelection() {
    document.querySelectorAll('.import-card').forEach(card => {
      card.classList.remove('selected');
    });
    document.querySelectorAll('.import-radio').forEach(radio => {
      radio.checked = false;
    });
    this.userData.importData.browser = null;
  }

  handleApiKeyInput(value) {
    const isValid = this.formValidator.validateApiKey(value);
    const feedback = document.getElementById('anthropicFeedback');
    
    if (!value) {
      this.formValidator.clearFeedback('anthropicFeedback');
    } else if (isValid) {
      this.formValidator.showFeedback('anthropicFeedback', 'Valid API key format', 'success');
    } else {
      this.formValidator.showFeedback('anthropicFeedback', 'Invalid API key format', 'error');
    }
  }

  loadSavedApiKeys() {
    const anthropicInput = document.getElementById('anthropicKey');
    if (anthropicInput && this.userData.apiKeys.anthropic) {
      anthropicInput.value = this.userData.apiKeys.anthropic;
    }
  }

  async saveApiKey(provider, key) {
    try {
      if (window.electronAPI && window.electronAPI.ipcInvoke) {
        await window.electronAPI.ipcInvoke('save-api-key', { provider, key });
      }
      console.log(`API key saved for ${provider}`);
    } catch (error) {
      console.error('Failed to save API key:', error);
    }
  }

  prepareCompletionData() {
    this.userData.setupComplete = true;
    this.saveUserData();
    
    // Mark onboarding as completed
    localStorage.setItem('onboarding_completed', 'true');
    localStorage.setItem('onboarding_completed_at', new Date().toISOString());
  }

  // Utility methods
  showSkipConfirmation() {
    const confirmed = confirm('Are you sure you want to skip the setup? You can always configure these settings later.');
    if (confirmed) {
      this.skipOnboarding();
    }
  }

  skipOnboarding() {
    localStorage.setItem('onboarding_completed', 'true');
    localStorage.setItem('onboarding_skipped', 'true');
    this.closeOnboarding();
  }

  showApiHelp() {
    // Open help window or modal
    window.open('https://console.anthropic.com/docs/api', '_blank');
  }

  openSettings() {
    if (window.electronAPI && window.electronAPI.ipcInvoke) {
      window.electronAPI.ipcInvoke('open-settings');
    }
    this.closeOnboarding();
  }

  async completOnboarding() {
    this.showLoadingOverlay('Completing setup...');
    
    try {
      // Finalize all settings
      this.savePreferencesToStorage();
      this.prepareCompletionData();
      
      // Notify main process
      if (window.electronAPI && window.electronAPI.ipcInvoke) {
        await window.electronAPI.ipcInvoke('onboarding-completed', {
          completed: true,
          skipped: false,
          userData: this.userData
        });
      }
      
      setTimeout(() => {
        this.closeOnboarding();
      }, 1000);
      
    } catch (error) {
      console.error('Failed to complete onboarding:', error);
      this.hideLoadingOverlay();
    }
  }

  closeOnboarding() {
    if (window.electronAPI && window.electronAPI.ipcInvoke) {
      window.electronAPI.ipcInvoke('close-onboarding');
    } else {
      window.close();
    }
  }

  showLoadingOverlay(message = 'Loading...') {
    const overlay = document.getElementById('loadingOverlay');
    const loadingText = document.querySelector('.loading-text');
    
    if (overlay) {
      overlay.classList.remove('hidden');
      overlay.classList.add('animate-fadeIn');
    }
    
    if (loadingText) {
      loadingText.textContent = message;
    }
  }

  hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
      overlay.classList.add('animate-fadeOut');
      setTimeout(() => {
        overlay.classList.add('hidden');
        overlay.classList.remove('animate-fadeOut', 'animate-fadeIn');
      }, 300);
    }
  }
}

// Export for use in other modules
window.OnboardingManager = OnboardingManager;
