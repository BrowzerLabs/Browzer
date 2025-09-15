/**
 * FormValidator - Handles form validation and user feedback
 * Provides real-time validation and professional feedback messages
 */

class FormValidator {
  constructor(onboardingManager) {
    this.onboardingManager = onboardingManager;
    this.validationRules = {
      email: {
        required: true,
        pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
        message: 'Please enter a valid email address'
      },
      verificationCode: {
        required: true,
        length: 6,
        pattern: /^\d{6}$/,
        message: 'Please enter a 6-digit verification code'
      },
      apiKey: {
        required: false,
        pattern: /^sk-ant-[a-zA-Z0-9]{40,}$/,
        message: 'API key should start with "sk-ant-" followed by at least 40 characters'
      }
    };
    
    this.init();
  }

  init() {
    this.setupRealTimeValidation();
    console.log('✅ FormValidator initialized');
  }

  /**
   * Setup real-time validation for form inputs
   */
  setupRealTimeValidation() {
    // Email validation
    const emailInput = document.getElementById('email');
    if (emailInput) {
      emailInput.addEventListener('input', (e) => {
        this.debounce(() => this.validateEmailInput(e.target), 300)();
      });
      
      emailInput.addEventListener('blur', (e) => {
        this.validateEmailInput(e.target);
      });
    }

    // Verification code validation
    const verificationInput = document.getElementById('verificationCode');
    if (verificationInput) {
      verificationInput.addEventListener('input', (e) => {
        this.validateVerificationInput(e.target);
        this.formatVerificationInput(e.target);
      });
    }

    // API key validation
    const apiKeyInput = document.getElementById('anthropicKey');
    if (apiKeyInput) {
      apiKeyInput.addEventListener('input', (e) => {
        this.debounce(() => this.validateApiKeyInput(e.target), 500)();
      });
    }
  }

  /**
   * Validate email input
   * @param {HTMLInputElement} input - Email input element
   */
  validateEmailInput(input) {
    const value = input.value.trim();
    const feedbackId = 'emailFeedback';
    
    if (!value) {
      this.clearFeedback(feedbackId);
      this.updateInputState(input, 'neutral');
      return false;
    }
    
    if (this.validateEmail(value)) {
      this.showFeedback(feedbackId, 'Valid email address', 'success');
      this.updateInputState(input, 'success');
      return true;
    } else {
      this.showFeedback(feedbackId, this.validationRules.email.message, 'error');
      this.updateInputState(input, 'error');
      return false;
    }
  }

  /**
   * Validate verification code input
   * @param {HTMLInputElement} input - Verification input element
   */
  validateVerificationInput(input) {
    const value = input.value.trim();
    const feedbackId = 'verificationFeedback';
    
    if (!value) {
      this.clearFeedback(feedbackId);
      this.updateInputState(input, 'neutral');
      return false;
    }
    
    if (value.length === 6 && /^\d{6}$/.test(value)) {
      this.updateInputState(input, 'success');
      return true;
    } else {
      if (value.length > 0 && value.length < 6) {
        this.showFeedback(feedbackId, `${6 - value.length} more digits needed`, 'warning');
      } else if (!/^\d+$/.test(value)) {
        this.showFeedback(feedbackId, 'Only numbers are allowed', 'error');
      }
      this.updateInputState(input, 'error');
      return false;
    }
  }

  /**
   * Format verification code input (add spacing)
   * @param {HTMLInputElement} input - Verification input element
   */
  formatVerificationInput(input) {
    let value = input.value.replace(/\D/g, ''); // Remove non-digits
    
    if (value.length > 6) {
      value = value.substring(0, 6);
    }
    
    input.value = value;
  }

  /**
   * Validate API key input
   * @param {HTMLInputElement} input - API key input element
   */
  validateApiKeyInput(input) {
    const value = input.value.trim();
    const feedbackId = 'anthropicFeedback';
    
    if (!value) {
      this.clearFeedback(feedbackId);
      this.updateInputState(input, 'neutral');
      return true; // API key is optional
    }
    
    if (this.validateApiKey(value)) {
      this.showFeedback(feedbackId, 'Valid API key format', 'success');
      this.updateInputState(input, 'success');
      return true;
    } else {
      this.showFeedback(feedbackId, this.validationRules.apiKey.message, 'error');
      this.updateInputState(input, 'error');
      return false;
    }
  }

  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} - Whether email is valid
   */
  validateEmail(email) {
    return this.validationRules.email.pattern.test(email);
  }

  /**
   * Validate verification code format
   * @param {string} code - Code to validate
   * @returns {boolean} - Whether code is valid
   */
  validateVerificationCode(code) {
    return this.validationRules.verificationCode.pattern.test(code);
  }

  /**
   * Validate API key format
   * @param {string} apiKey - API key to validate
   * @returns {boolean} - Whether API key is valid
   */
  validateApiKey(apiKey) {
    return this.validationRules.apiKey.pattern.test(apiKey);
  }

  /**
   * Show feedback message
   * @param {string} feedbackId - ID of feedback element
   * @param {string} message - Message to show
   * @param {string} type - Type: success, error, warning
   */
  showFeedback(feedbackId, message, type) {
    const feedbackElement = document.getElementById(feedbackId);
    if (!feedbackElement) return;
    
    // Clear existing classes
    feedbackElement.classList.remove('success', 'error', 'warning');
    
    // Add new type class
    feedbackElement.classList.add(type);
    
    // Set message with icon
    const icon = this.getFeedbackIcon(type);
    feedbackElement.innerHTML = `${icon} ${message}`;
    
    // Animate feedback
    if (this.onboardingManager.stepManager) {
      this.onboardingManager.stepManager.animateFeedback(feedbackElement, type);
    }
    
    // Auto-clear success messages after 5 seconds
    if (type === 'success') {
      setTimeout(() => {
        this.clearFeedback(feedbackId);
      }, 5000);
    }
  }

  /**
   * Clear feedback message
   * @param {string} feedbackId - ID of feedback element
   */
  clearFeedback(feedbackId) {
    const feedbackElement = document.getElementById(feedbackId);
    if (!feedbackElement) return;
    
    feedbackElement.classList.remove('success', 'error', 'warning');
    feedbackElement.innerHTML = '';
  }

  /**
   * Update input visual state
   * @param {HTMLInputElement} input - Input element
   * @param {string} state - State: success, error, neutral
   */
  updateInputState(input, state) {
    const formGroup = input.closest('.form-group');
    if (!formGroup) return;
    
    // Clear existing state classes
    formGroup.classList.remove('success', 'error');
    
    // Add new state class
    if (state !== 'neutral') {
      formGroup.classList.add(state);
    }
  }

  /**
   * Get feedback icon for message type
   * @param {string} type - Message type
   * @returns {string} - Icon HTML
   */
  getFeedbackIcon(type) {
    const icons = {
      success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22,4 12,14.01 9,11.01"/></svg>',
      error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>',
      warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>'
    };
    
    return icons[type] || '';
  }

  /**
   * Validate entire form for a specific step
   * @param {number} stepNumber - Step to validate
   * @returns {boolean} - Whether step is valid
   */
  validateStep(stepNumber) {
    switch (stepNumber) {
      case 2: // Account setup
        return this.validateAccountStep();
      case 3: // Preferences
        return this.validatePreferencesStep();
      case 4: // Import
        return this.validateImportStep();
      case 5: // API setup
        return this.validateApiStep();
      default:
        return true;
    }
  }

  /**
   * Validate account setup step
   * @returns {boolean} - Whether step is valid
   */
  validateAccountStep() {
    const email = document.getElementById('email')?.value;
    const verificationCode = document.getElementById('verificationCode')?.value;
    
    if (!email || !this.validateEmail(email)) {
      this.showFeedback('emailFeedback', 'Valid email is required', 'error');
      return false;
    }
    
    if (!this.onboardingManager.userData.verified) {
      this.showFeedback('verificationFeedback', 'Please verify your email address', 'error');
      return false;
    }
    
    return true;
  }

  /**
   * Validate preferences step
   * @returns {boolean} - Whether step is valid
   */
  validatePreferencesStep() {
    // Preferences are always valid (toggles have default states)
    return true;
  }

  /**
   * Validate import step
   * @returns {boolean} - Whether step is valid
   */
  validateImportStep() {
    const selectedBrowser = this.onboardingManager.userData.importData.browser;
    
    if (!selectedBrowser) {
      // Show visual feedback on import cards
      const importOptions = document.querySelector('.import-options');
      if (importOptions) {
        importOptions.style.border = '2px solid var(--error-500)';
        importOptions.style.borderRadius = 'var(--radius-lg)';
        
        setTimeout(() => {
          importOptions.style.border = '';
          importOptions.style.borderRadius = '';
        }, 3000);
      }
      return false;
    }
    
    return true;
  }

  /**
   * Validate API setup step
   * @returns {boolean} - Whether step is valid
   */
  validateApiStep() {
    const apiKey = document.getElementById('anthropicKey')?.value;
    
    // API key is optional, but if provided, must be valid
    if (apiKey && !this.validateApiKey(apiKey)) {
      this.showFeedback('anthropicFeedback', 'Please enter a valid API key or leave empty', 'error');
      return false;
    }
    
    return true;
  }

  /**
   * Show form loading state
   * @param {string} buttonId - ID of button to show loading state
   * @param {string} loadingText - Text to show during loading
   */
  showLoadingState(buttonId, loadingText = 'Loading...') {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    button.disabled = true;
    button.classList.add('loading');
    button.setAttribute('data-original-text', button.textContent);
    button.textContent = loadingText;
  }

  /**
   * Hide form loading state
   * @param {string} buttonId - ID of button to hide loading state
   */
  hideLoadingState(buttonId) {
    const button = document.getElementById(buttonId);
    if (!button) return;
    
    button.disabled = false;
    button.classList.remove('loading');
    const originalText = button.getAttribute('data-original-text');
    if (originalText) {
      button.textContent = originalText;
      button.removeAttribute('data-original-text');
    }
  }

  /**
   * Debounce function for input validation
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} - Debounced function
   */
  debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Reset all form validation states
   */
  resetValidation() {
    // Clear all feedback messages
    const feedbackElements = document.querySelectorAll('.form-feedback');
    feedbackElements.forEach(element => {
      element.classList.remove('success', 'error', 'warning');
      element.innerHTML = '';
    });
    
    // Reset form group states
    const formGroups = document.querySelectorAll('.form-group');
    formGroups.forEach(group => {
      group.classList.remove('success', 'error');
    });
    
    // Reset button states
    const buttons = document.querySelectorAll('.loading');
    buttons.forEach(button => {
      this.hideLoadingState(button.id);
    });
  }
}

// Export for use in other modules
window.FormValidator = FormValidator;
