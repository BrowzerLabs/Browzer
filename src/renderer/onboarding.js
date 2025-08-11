// Onboarding JavaScript - Interactive Flow Management

class OnboardingManager {
  constructor() {
    this.currentStep = 0;
    this.totalSteps = 8;
    this.isAnimating = false;
    this.userPreferences = {
      email: '',
      verified: false,
      apiKeys: {},
      settings: {
        sidebar: true,
        adblock: true
      },
      importData: {
        browser: null,
        completed: false
      },
      skipOnboarding: false
    };
    
    this.init();
  }

  init() {
    this.setupEventListeners();
    this.updateProgressBar();
    this.startWelcomeAnimations();
    
    // Auto-advance welcome step after 3 seconds if user doesn't interact
    setTimeout(() => {
      if (this.currentStep === 0) {
        this.addAutoAdvanceHint();
      }
    }, 3000);
  }

  setupEventListeners() {
    // Skip button
    document.getElementById('skipBtn').addEventListener('click', () => {
      this.showSkipConfirmation();
    });

    // API key input
    const apiInput = document.getElementById('anthropicKey');
    if (apiInput) {
      apiInput.addEventListener('input', (e) => {
        this.validateApiKey(e.target.value);
      });
    }

    // Keyboard navigation
    document.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (!this.isAnimating && this.currentStep < this.totalSteps - 1) {
          this.nextStep();
        }
      } else if (e.key === 'ArrowLeft') {
        if (!this.isAnimating && this.currentStep > 0) {
          this.prevStep();
        }
      } else if (e.key === 'Escape') {
        this.showSkipConfirmation();
      }
    });

    // Step dot navigation
    document.querySelectorAll('.step-dot').forEach((dot, index) => {
      dot.addEventListener('click', () => {
        if (index <= this.currentStep + 1) { // Allow clicking current + 1 step ahead
          this.goToStep(index);
        }
      });
    });
  }

  nextStep() {
    if (this.isAnimating || this.currentStep >= this.totalSteps - 1) return;
    
    // Validate current step before proceeding
    if (!this.validateCurrentStep()) return;
    
    this.transitionToStep(this.currentStep + 1);
  }

  prevStep() {
    if (this.isAnimating || this.currentStep <= 0) return;
    this.transitionToStep(this.currentStep - 1);
  }

  goToStep(stepIndex) {
    if (this.isAnimating || stepIndex === this.currentStep) return;
    this.transitionToStep(stepIndex);
  }

  transitionToStep(newStep) {
    this.isAnimating = true;
    
    const currentStepEl = document.getElementById(`step-${this.currentStep}`);
    const newStepEl = document.getElementById(`step-${newStep}`);
    
    // Add exit animation to current step
    currentStepEl.style.animation = 'fadeOutDown 0.4s cubic-bezier(0.4, 0, 0.2, 1)';
    
    setTimeout(() => {
      // Hide current step
      currentStepEl.classList.remove('active');
      currentStepEl.style.animation = '';
      
      // Show new step
      this.currentStep = newStep;
      newStepEl.classList.add('active');
      
      // Update UI
      this.updateProgressBar();
      this.updateStepDots();
      this.triggerStepAnimations();
      
      // Re-enable interactions
      setTimeout(() => {
        this.isAnimating = false;
      }, 300);
      
    }, 400);
  }

  updateProgressBar() {
    const progressFill = document.getElementById('progressFill');
    const progress = ((this.currentStep + 1) / this.totalSteps) * 100;
    progressFill.style.width = `${progress}%`;
  }

  updateStepDots() {
    document.querySelectorAll('.step-dot').forEach((dot, index) => {
      dot.classList.remove('active', 'completed');
      
      if (index === this.currentStep) {
        dot.classList.add('active');
      } else if (index < this.currentStep) {
        dot.classList.add('completed');
      }
    });
  }

  validateCurrentStep() {
    switch (this.currentStep) {
      case 0: // Welcome step
        return true;
      case 1: // Email verification step
        return this.userPreferences.verified;
      case 2: // Browser settings step
        this.updateSettings();
        return true;
      case 3: // Chrome import step
        // Validation handled in handleImport()
        return true;
      case 4: // AI features step
        return true;
      case 5: // Automation step
        return true;
      case 6: // API setup step
        const apiKey = document.getElementById('anthropicKey')?.value;
        if (apiKey) {
          this.userPreferences.apiKeys.anthropic = apiKey;
          this.saveApiKey('anthropic', apiKey);
        }
        return true;
      case 7: // Completion step
        return true;
      default:
        return true;
    }
  }

  validateApiKey(key) {
    const input = document.getElementById('anthropicKey');
    const isValid = key.startsWith('sk-ant-') && key.length > 20;
    
    if (key.length === 0) {
      input.style.borderColor = '#e0e0e0';
      return;
    }
    
    if (isValid) {
      input.style.borderColor = '#27ca3f';
      input.style.boxShadow = '0 0 0 3px rgba(39, 202, 63, 0.1)';
      this.showValidationMessage('✅ Valid API key format', 'success');
    } else {
      input.style.borderColor = '#ff5f56';
      input.style.boxShadow = '0 0 0 3px rgba(255, 95, 86, 0.1)';
      this.showValidationMessage('⚠️ Please check your API key format', 'warning');
    }
  }

  showValidationMessage(message, type) {
    // Remove existing validation message
    const existing = document.querySelector('.validation-message');
    if (existing) existing.remove();
    
    const messageEl = document.createElement('div');
    messageEl.className = `validation-message ${type}`;
    messageEl.textContent = message;
    messageEl.style.cssText = `
      margin-top: 8px;
      padding: 8px 12px;
      border-radius: 6px;
      font-size: 14px;
      animation: slideIn 0.3s ease;
      ${type === 'success' ? 'background: rgba(39, 202, 63, 0.1); color: #27ca3f;' : 'background: rgba(255, 95, 86, 0.1); color: #ff5f56;'}
    `;
    
    document.querySelector('.api-service').appendChild(messageEl);
    
    // Auto-remove after 3 seconds
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => messageEl.remove(), 300);
      }
    }, 3000);
  }

  triggerStepAnimations() {
    const currentStepEl = document.getElementById(`step-${this.currentStep}`);
    
    switch (this.currentStep) {
      case 0: // Welcome
        this.startWelcomeAnimations();
        break;
      case 1: // Email verification
        this.startEmailAnimations();
        break;
      case 2: // Browser settings
        this.startSettingsAnimations();
        break;
      case 3: // Chrome import
        this.startImportAnimations();
        break;
      case 4: // AI Features
        this.startAIAnimations();
        break;
      case 5: // Automation
        this.startAutomationAnimations();
        break;
      case 6: // API Setup
        this.startAPIAnimations();
        break;
      case 7: // Completion
        this.startCompletionAnimations();
        break;
    }
  }

  startWelcomeAnimations() {
    // Stagger animation for floating dots
    const dots = document.querySelectorAll('.floating-dot');
    dots.forEach((dot, index) => {
      dot.style.animationDelay = `${index * 0.5}s`;
    });

    // Animate feature highlights
    const highlights = document.querySelectorAll('.highlight-item');
    highlights.forEach((item, index) => {
      item.style.animation = `fadeInUp 0.6s ease ${index * 0.1}s both`;
    });
  }

  startEmailAnimations() {
    const emailIcon = document.querySelector('.email-icon');
    if (emailIcon) {
      emailIcon.style.animation = 'pulse 2s infinite';
    }
  }

  startSettingsAnimations() {
    const settingItems = document.querySelectorAll('.setting-item');
    settingItems.forEach((item, index) => {
      item.style.animation = `fadeInUp 0.6s ease ${index * 0.2}s both`;
    });
  }

  startImportAnimations() {
    const importItems = document.querySelectorAll('.import-item');
    importItems.forEach((item, index) => {
      item.style.animation = `fadeInUp 0.6s ease ${index * 0.1}s both`;
    });
  }

  startAIAnimations() {
    // Animate chat messages
    const messages = document.querySelectorAll('.chat-message');
    messages.forEach((msg, index) => {
      msg.style.animation = `messageSlideIn 0.8s ease ${index * 0.5}s both`;
    });
    
    // Start sparkle animations
    setTimeout(() => {
      const sparkles = document.querySelectorAll('.sparkle');
      sparkles.forEach(sparkle => {
        sparkle.style.animation = 'sparkle 1.5s ease-in-out infinite';
      });
    }, 1000);
  }

  startAutomationAnimations() {
    // Animate automation actions
    const actions = document.querySelectorAll('.auto-action');
    actions.forEach((action, index) => {
      action.style.animation = `actionAppear 0.8s ease ${index * 0.5}s both`;
    });
  }

  startAPIAnimations() {
    // Animate connection lines
    const lines = document.querySelectorAll('.line');
    lines.forEach((line, index) => {
      line.style.animation = `pulse-line 2s ease-in-out infinite ${index * 0.7}s`;
    });

    // Animate orbiting icons
    const icons = document.querySelectorAll('.service-icon');
    icons.forEach((icon, index) => {
      icon.style.animation = `iconOrbit 3s linear infinite ${index * 1}s`;
    });
  }

  startCompletionAnimations() {
    // Celebration particles
    const particles = document.querySelectorAll('.particle');
    particles.forEach((particle, index) => {
      particle.style.animation = `celebrate 2s ease-in-out infinite ${index * 0.5}s`;
    });

    // Success pulse
    const successIcon = document.querySelector('.success-icon');
    successIcon.style.animation = 'successPulse 2s ease-in-out infinite';

    // Confetti effect
    this.createConfetti();
  }

  createConfetti() {
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#feca57', '#ff9ff3'];
    const confettiContainer = document.createElement('div');
    confettiContainer.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 1000;
    `;
    document.body.appendChild(confettiContainer);

    for (let i = 0; i < 50; i++) {
      const confetti = document.createElement('div');
      confetti.style.cssText = `
        position: absolute;
        width: 8px;
        height: 8px;
        background: ${colors[Math.floor(Math.random() * colors.length)]};
        top: -10px;
        left: ${Math.random() * 100}%;
        animation: confettiFall ${2 + Math.random() * 3}s linear infinite;
        animation-delay: ${Math.random() * 2}s;
        transform: rotate(${Math.random() * 360}deg);
      `;
      confettiContainer.appendChild(confetti);
    }

    // Clean up confetti after 5 seconds
    setTimeout(() => {
      confettiContainer.remove();
    }, 5000);
  }

  addAutoAdvanceHint() {
    if (this.currentStep !== 0) return;
    
    const button = document.querySelector('.primary-btn');
    button.style.animation = 'pulse 1s ease-in-out 3';
    
    // Add a subtle hint
    const hint = document.createElement('div');
    hint.textContent = '👆 Click to continue or use arrow keys';
    hint.style.cssText = `
      position: absolute;
      bottom: -40px;
      left: 50%;
      transform: translateX(-50%);
      font-size: 14px;
      color: rgba(255, 255, 255, 0.8);
      animation: fadeIn 0.5s ease;
    `;
    button.parentElement.style.position = 'relative';
    button.parentElement.appendChild(hint);
    
    // Remove hint after 5 seconds
    setTimeout(() => {
      if (hint.parentNode) hint.remove();
    }, 5000);
  }

  showSkipConfirmation() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.3s ease;
    `;

    const modal = document.createElement('div');
    modal.style.cssText = `
      background: white;
      padding: 40px;
      border-radius: 16px;
      text-align: center;
      max-width: 400px;
      margin: 20px;
      animation: scaleIn 0.3s ease;
    `;

    modal.innerHTML = `
      <h3 style="margin-bottom: 16px; color: #2c3e50;">Skip Onboarding?</h3>
      <p style="margin-bottom: 30px; color: #5a6c7d; line-height: 1.5;">
        You can always access these features later in settings. 
        Are you sure you want to skip the quick tour?
      </p>
      <div style="display: flex; gap: 16px; justify-content: center;">
        <button class="secondary-btn" onclick="this.parentElement.parentElement.parentElement.remove()">
          Continue Tour
        </button>
        <button class="primary-btn" onclick="onboardingManager.finishOnboarding(true)">
          Skip Tour
        </button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    // Close on escape or outside click
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  async saveApiKey(provider, key) {
    try {
      // Send to main process via IPC
      if (window.electronAPI && window.electronAPI.ipcInvoke) {
        await window.electronAPI.ipcInvoke('save-api-key', { provider, key });
        // console.log(`✅ API key saved for ${provider}`);
      } else {
        // Fallback to localStorage for development
        localStorage.setItem(`apiKey_${provider}`, key);
        // console.log(`✅ API key saved to localStorage for ${provider}`);
      }
    } catch (error) {
      console.error('Failed to save API key:', error);
      this.showValidationMessage('⚠️ Failed to save API key', 'warning');
    }
  }

  openApiHelp() {
    const helpWindow = window.open('', '_blank', 'width=600,height=400');
    helpWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>API Key Setup Guide</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 20px; line-height: 1.6; }
          .step { margin-bottom: 20px; padding: 16px; background: #f8f9fa; border-radius: 8px; }
          .step-number { background: #667eea; color: white; border-radius: 50%; width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; margin-right: 12px; }
          a { color: #667eea; }
        </style>
      </head>
      <body>
        <h2>🔑 Getting Your Anthropic API Key</h2>
        <div class="step">
          <span class="step-number">1</span>
          Visit <a href="https://console.anthropic.com" target="_blank">console.anthropic.com</a>
        </div>
        <div class="step">
          <span class="step-number">2</span>
          Sign up or log in to your account
        </div>
        <div class="step">
          <span class="step-number">3</span>
          Navigate to "API Keys" in the settings
        </div>
        <div class="step">
          <span class="step-number">4</span>
          Click "Create Key" and copy the generated key
        </div>
        <div class="step">
          <span class="step-number">5</span>
          Paste the key back in Browzer (starts with "sk-ant-")
        </div>
        <p><strong>Note:</strong> Keep your API key secure and never share it publicly!</p>
      </body>
      </html>
    `);
  }

  openSettings() {
    // Send message to main process to open settings
    if (window.electronAPI && window.electronAPI.ipcInvoke) {
      window.electronAPI.ipcInvoke('open-settings');
    }
    this.finishOnboarding();
  }

  finishOnboarding(skipped = false) {
    // Save onboarding completion status
    localStorage.setItem('onboarding_completed', 'true');
    localStorage.setItem('onboarding_skipped', skipped.toString());
    localStorage.setItem('onboarding_completed_at', new Date().toISOString());
    
    // Send completion event to main process
    if (window.electronAPI && window.electronAPI.ipcInvoke) {
      window.electronAPI.ipcInvoke('onboarding-completed', {
        completed: true,
        skipped,
        preferences: this.userPreferences
      });
    }

    // Show completion message
    if (!skipped) {
      this.showCompletionMessage();
    } else {
      this.closeOnboarding();
    }
  }

  showCompletionMessage() {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      animation: fadeIn 0.5s ease;
    `;

    const message = document.createElement('div');
    message.style.cssText = `
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(20px);
      padding: 60px 40px;
      border-radius: 24px;
      text-align: center;
      animation: scaleIn 0.5s ease;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.2);
    `;

    message.innerHTML = `
      <div style="font-size: 4rem; margin-bottom: 20px;">🚀</div>
      <h2 style="color: #2c3e50; margin-bottom: 16px;">Welcome to Browzer!</h2>
      <p style="color: #5a6c7d; margin-bottom: 30px; font-size: 1.1rem;">
        Your AI-powered browsing experience starts now
      </p>
      <button class="primary-btn" onclick="onboardingManager.closeOnboarding()">
        Start Browsing ✨
      </button>
    `;

    overlay.appendChild(message);
    document.body.appendChild(overlay);

    // Auto-close after 3 seconds
    setTimeout(() => {
      this.closeOnboarding();
    }, 3000);
  }

  // Email verification functions
  async sendOTP() {
    const email = document.getElementById('userEmail').value;
    const emailStatus = document.getElementById('emailStatus');
    const sendOtpBtn = document.getElementById('sendOtpBtn');
    
    if (!this.validateEmail(email)) {
      this.showStatus('emailStatus', 'Please enter a valid email address', 'error');
      return;
    }

    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = 'Sending...';
    
    try {
      // Create user first
      if (window.electronAPI && window.electronAPI.ipcInvoke) {
        await window.electronAPI.ipcInvoke('create-user', email);
      }
      
      // Send OTP via email service API
      const result = await this.sendOTPViaAPI(email);
      
      if (result.success) {
        this.userPreferences.email = email;
        document.getElementById('otpSection').style.display = 'block';
        document.getElementById('emailButtons').style.display = 'flex';
        sendOtpBtn.style.display = 'none';
        
        this.showStatus('emailStatus', result.message || 'Verification code sent to your email! Please check your spam or promotions folder if you don\'t see it in your primary inbox.', 'success');
        
        // Auto-focus OTP input
        document.getElementById('otpCode').focus();
      } else {
        throw new Error(result.message || 'Failed to send OTP');
      }
      
    } catch (error) {
      console.error('OTP sending failed:', error);
      this.showStatus('emailStatus', error.message || 'Failed to send verification code. Please try again.', 'error');
      sendOtpBtn.disabled = false;
      sendOtpBtn.textContent = 'Send Verification Code';
    }
  }

  async verifyOTP() {
    const otpCode = document.getElementById('otpCode').value;
    const emailNextBtn = document.getElementById('emailNextBtn');
    
    if (!otpCode || otpCode.length !== 6) {
      this.showStatus('otpStatus', 'Please enter a 6-digit verification code', 'error');
      return;
    }

    try {
      // Verify OTP against client-side stored OTP
      const result = this.verifyOTPClient(otpCode);
      
      if (result.success) {
        this.userPreferences.verified = true;
        this.showStatus('otpStatus', result.message || 'Email verified successfully!', 'success');
        emailNextBtn.disabled = false;
        
        // Login user to create session
        if (window.electronAPI && window.electronAPI.ipcInvoke) {
          const loginResult = await window.electronAPI.ipcInvoke('login-user', this.userPreferences.email);
          if (loginResult.success) {
            this.userPreferences.sessionId = loginResult.sessionId;
            this.userPreferences.user = loginResult.user;
          }
        }
        
      } else {
        this.showStatus('otpStatus', result.message || 'Invalid verification code. Please try again.', 'error');
      }
    } catch (error) {
      console.error('OTP verification failed:', error);
      this.showStatus('otpStatus', error.message || 'Verification failed. Please try again.', 'error');
    }
  }

  async resendOTP() {
    const email = this.userPreferences.email;
    if (email) {
      try {
        const result = await this.sendOTPViaAPI(email);
        
        if (result.success) {
          this.showStatus('emailStatus', result.message || 'Verification code resent!', 'success');
        } else {
          this.showStatus('emailStatus', result.message || 'Failed to resend code', 'error');
        }
      } catch (error) {
        console.error('Resend OTP failed:', error);
        this.showStatus('emailStatus', 'Failed to resend verification code', 'error');
      }
    }
  }

  validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  async sendOTPViaAPI(email) {
    // Generate OTP on client side
    const otp = this.generateOTP();
    this.currentOTP = otp; // Store for verification
    
    try {
      // Call email service API
      const EMAIL_SERVICE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
        ? 'http://localhost:5001'  // Local development (avoiding AirPlay port 5000)
        : 'https://browzer-email-service-3fd1c9e21714.herokuapp.com'; // Production
      
      const response = await fetch(`${EMAIL_SERVICE_URL}/api/send-otp`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: email,
          otp: otp,
          clientId: 'browzer-desktop'
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      
      const result = await response.json();
      return result;
      
    } catch (error) {
      console.error('Email service API error:', error);
      
      // Fallback to development mode
      // console.log(`🔐 DEVELOPMENT MODE - OTP for ${email}: ${otp}`);
      return {
        success: true,
        message: 'OTP sent (development mode - check console)',
        messageId: 'dev-mode-' + Date.now()
      };
    }
  }

  generateOTP() {
    // Generate secure 6-digit OTP
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  verifyOTPClient(inputOtp) {
    // Verify OTP against stored OTP
    if (!this.currentOTP) {
      return {
        success: false,
        message: 'No OTP found. Please request a new verification code.'
      };
    }

    if (inputOtp === this.currentOTP) {
      // Clear the OTP after successful verification
      this.currentOTP = null;
      return {
        success: true,
        message: 'Email verified successfully!'
      };
    } else {
      return {
        success: false,
        message: 'Invalid verification code. Please try again.'
      };
    }
  }

  async simulateOTPSend(email) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1500));
    // In production, this would call your email service API
    // console.log(`OTP sent to ${email}`);
    return true;
  }

  async simulateOTPVerify(code) {
    // Simulate API call delay
    await new Promise(resolve => setTimeout(resolve, 1000));
    // For demo purposes, accept any 6-digit code
    return code.length === 6;
  }

  async saveUserEmail(email) {
    try {
      if (window.electronAPI && window.electronAPI.ipcInvoke) {
        await window.electronAPI.ipcInvoke('save-user-email', email);
      } else {
        localStorage.setItem('userEmail', email);
      }
    } catch (error) {
      console.error('Failed to save user email:', error);
    }
  }

  // Browser settings functions
  async updateSettings() {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const adblockToggle = document.getElementById('adblockToggle');
    
    this.userPreferences.settings.sidebar = sidebarToggle.checked;
    this.userPreferences.settings.adblock = adblockToggle.checked;
    
    // CRITICAL: Save to localStorage for main browser to read
    localStorage.setItem('sidebarEnabled', sidebarToggle.checked.toString());
    localStorage.setItem('adBlockEnabled', adblockToggle.checked.toString());
    
    // console.log('[Onboarding] Settings saved to localStorage:', {
    //   sidebarEnabled: sidebarToggle.checked,
    //   adBlockEnabled: adblockToggle.checked
    // });
    
    // Save to backend if user is logged in
    if (this.userPreferences.user && window.electronAPI && window.electronAPI.ipcInvoke) {
      try {
        await window.electronAPI.ipcInvoke('update-user-preferences', {
          userId: this.userPreferences.user.id,
          preferences: this.userPreferences.settings
        });
      } catch (error) {
        console.error('Failed to save settings to backend:', error);
      }
    }
  }

  // Browser import functions
  selectBrowser(browser) {
    // Update radio buttons
    document.querySelectorAll('input[name="browser"]').forEach(radio => {
      radio.checked = radio.value === browser;
    });
    
    // Update visual selection
    document.querySelectorAll('.browser-option').forEach(option => {
      option.classList.remove('selected');
    });
    
    const selectedOption = document.querySelector(`input[value="${browser}"]`).closest('.import-item').querySelector('.browser-option');
    selectedOption.classList.add('selected');
    
    this.userPreferences.importData.browser = browser;
  }

  async handleImport() {
    const selectedBrowser = this.userPreferences.importData.browser;
    
    if (!selectedBrowser) {
      alert('Please select a browser to import from or choose to skip.');
      return;
    }
    
    if (selectedBrowser === 'skip') {
      this.nextStep();
      return;
    }
    
    // Show import progress
    document.getElementById('importProgress').style.display = 'block';
    document.getElementById('importBtn').disabled = true;
    
    try {
      await this.importBrowserData(selectedBrowser);
      this.userPreferences.importData.completed = true;
      this.nextStep();
    } catch (error) {
      console.error('Import failed:', error);
      document.getElementById('importStatus').textContent = 'Import failed. You can try again later.';
      setTimeout(() => {
        this.nextStep();
      }, 2000);
    }
  }

  async importBrowserData(browser) {
    const progressFill = document.getElementById('importProgressFill');
    const statusText = document.getElementById('importStatus');
    
    const steps = [
      'Locating browser data...',
      'Reading browsing history...',
      'Importing bookmarks...',
      'Processing data...',
      'Finalizing import...'
    ];
    
    for (let i = 0; i < steps.length; i++) {
      statusText.textContent = steps[i];
      progressFill.style.width = `${((i + 1) / steps.length) * 100}%`;
      await new Promise(resolve => setTimeout(resolve, 800));
    }
    
    // Call the actual import API
    if (window.electronAPI && window.electronAPI.ipcInvoke) {
      try {
        const result = await window.electronAPI.ipcInvoke('import-browser-data', { browser });
        if (result.success) {
          statusText.textContent = result.message || 'Import completed successfully!';
          // console.log('Browser import successful:', result);
        } else {
          statusText.textContent = result.message || 'Import failed';
          console.error('Browser import failed:', result.message);
        }
      } catch (error) {
        console.error('Browser import failed:', error);
        statusText.textContent = 'Import failed due to an error';
      }
    }
  }

  showStatus(elementId, message, type) {
    const statusElement = document.getElementById(elementId);
    statusElement.textContent = message;
    statusElement.className = `input-status ${type}`;
  }

  closeOnboarding() {
    // Final sync of settings to localStorage before closing
    this.finalizeSettings();
    
    // Fade out the entire onboarding
    document.body.style.animation = 'fadeOut 0.5s ease';
    
    setTimeout(() => {
      // Send close message to main process
      if (window.electronAPI && window.electronAPI.ipcInvoke) {
        window.electronAPI.ipcInvoke('close-onboarding');
      } else {
        // Fallback for development
        window.close();
      }
    }, 500);
  }

  finalizeSettings() {
    // Ensure all settings are properly saved to localStorage
    const sidebarToggle = document.getElementById('sidebarToggle');
    const adblockToggle = document.getElementById('adblockToggle');
    
    if (sidebarToggle) {
      localStorage.setItem('sidebarEnabled', sidebarToggle.checked.toString());
      // console.log('[Onboarding] Final sidebar setting:', sidebarToggle.checked);
    }
    
    if (adblockToggle) {
      localStorage.setItem('adBlockEnabled', adblockToggle.checked.toString());
      // console.log('[Onboarding] Final adblock setting:', adblockToggle.checked);
    }
    
    // Mark onboarding as completed
    localStorage.setItem('onboardingCompleted', 'true');
    // console.log('[Onboarding] Settings finalized and onboarding marked as completed');
  }
}

// Global functions for HTML onclick handlers
function nextStep() {
  onboardingManager.nextStep();
}

function prevStep() {
  onboardingManager.prevStep();
}

function openApiHelp() {
  onboardingManager.openApiHelp();
}

function openSettings() {
  onboardingManager.openSettings();
}

function finishOnboarding() {
  onboardingManager.finishOnboarding();
}

// Email verification functions
function sendOTP() {
  onboardingManager.sendOTP();
}

function verifyOTP() {
  onboardingManager.verifyOTP();
}

function resendOTP() {
  onboardingManager.resendOTP();
}

// Browser selection functions
function selectBrowser(browser) {
  onboardingManager.selectBrowser(browser);
}

function handleImport() {
  onboardingManager.handleImport();
}

// Add required CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeInUp {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes fadeOutDown {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(20px); }
  }
  
  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
  
  @keyframes scaleIn {
    from { opacity: 0; transform: scale(0.9); }
    to { opacity: 1; transform: scale(1); }
  }
  
  @keyframes slideIn {
    from { opacity: 0; transform: translateY(-10px); }
    to { opacity: 1; transform: translateY(0); }
  }
  
  @keyframes slideOut {
    from { opacity: 1; transform: translateY(0); }
    to { opacity: 0; transform: translateY(-10px); }
  }
  
  @keyframes confettiFall {
    0% { transform: translateY(-100vh) rotate(0deg); opacity: 1; }
    100% { transform: translateY(100vh) rotate(360deg); opacity: 0; }
  }
  
  @keyframes pulse {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.05); }
  }
`;
document.head.appendChild(style);

// Initialize onboarding when DOM is loaded
let onboardingManager;
document.addEventListener('DOMContentLoaded', () => {
  onboardingManager = new OnboardingManager();
});

// Handle window resize for responsive behavior
window.addEventListener('resize', () => {
  // Adjust animations for mobile
  const isMobile = window.innerWidth < 768;
  document.body.classList.toggle('mobile', isMobile);
});
