/**
 * StepManager - Handles step transitions and animations
 * Manages the visual flow between onboarding steps
 */

class StepManager {
  constructor(onboardingManager) {
    this.onboardingManager = onboardingManager;
    this.transitionDuration = 400; // milliseconds
    this.currentStepElement = null;
    
    this.init();
  }

  init() {
    // Get initial step element
    this.currentStepElement = document.querySelector('.onboarding-step.active');
    
    console.log('✅ StepManager initialized');
  }

  /**
   * Transition to a specific step with smooth animation
   * @param {number} stepNumber - Target step number
   * @param {string} direction - 'forward' or 'backward' for animation direction
   */
  async transitionToStep(stepNumber, direction = null) {
    const targetStepElement = document.getElementById(`step-${stepNumber}`);
    
    if (!targetStepElement) {
      throw new Error(`Step ${stepNumber} not found`);
    }

    // Determine animation direction if not provided
    if (!direction) {
      const currentStep = this.onboardingManager.currentStep;
      direction = stepNumber > currentStep ? 'forward' : 'backward';
    }

    // Perform the transition
    await this.performTransition(this.currentStepElement, targetStepElement, direction);
    
    // Update current step reference
    this.currentStepElement = targetStepElement;
    
    // Trigger step-specific animations
    this.triggerStepAnimations(stepNumber);
  }

  /**
   * Perform the actual transition between steps
   * @param {HTMLElement} currentStep - Current step element
   * @param {HTMLElement} targetStep - Target step element
   * @param {string} direction - Animation direction
   */
  async performTransition(currentStep, targetStep, direction) {
    return new Promise((resolve) => {
      // Set initial states
      if (currentStep) {
        currentStep.style.position = 'absolute';
        currentStep.style.width = '100%';
        currentStep.style.opacity = '1';
        currentStep.style.transform = 'translateX(0)';
        currentStep.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      }

      // Prepare target step
      targetStep.style.position = 'absolute';
      targetStep.style.width = '100%';
      targetStep.style.opacity = '0';
      targetStep.style.transform = direction === 'forward' ? 'translateX(30px)' : 'translateX(-30px)';
      targetStep.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      targetStep.classList.add('active');

      // Force reflow
      targetStep.offsetHeight;

      // Start animations
      requestAnimationFrame(() => {
        // Fade out current step
        if (currentStep) {
          currentStep.style.opacity = '0';
          currentStep.style.transform = direction === 'forward' ? 'translateX(-30px)' : 'translateX(30px)';
        }

        // Fade in target step
        targetStep.style.opacity = '1';
        targetStep.style.transform = 'translateX(0)';
      });

      // Clean up after animation
      setTimeout(() => {
        if (currentStep) {
          currentStep.classList.remove('active');
          currentStep.style.position = '';
          currentStep.style.width = '';
          currentStep.style.opacity = '';
          currentStep.style.transform = '';
          currentStep.style.transition = '';
        }

        targetStep.style.position = '';
        targetStep.style.width = '';
        targetStep.style.opacity = '';
        targetStep.style.transform = '';
        targetStep.style.transition = '';

        resolve();
      }, 350);
    });
  }

  /**
   * Trigger step-specific entrance animations
   * @param {number} stepNumber - Step number
   */
  triggerStepAnimations(stepNumber) {
    const stepElement = document.getElementById(`step-${stepNumber}`);
    if (!stepElement) return;

    switch (stepNumber) {
      case 1:
        this.animateWelcomeStep(stepElement);
        break;
      case 2:
        this.animateAccountStep(stepElement);
        break;
      case 3:
        this.animatePreferencesStep(stepElement);
        break;
      case 4:
        this.animateImportStep(stepElement);
        break;
      case 5:
        this.animateApiStep(stepElement);
        break;
      case 6:
        this.animateCompletionStep(stepElement);
        break;
    }
  }

  /**
   * Welcome step animations
   */
  animateWelcomeStep(stepElement) {
    const featureCards = stepElement.querySelectorAll('.feature-card');
    
    featureCards.forEach((card, index) => {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      
      setTimeout(() => {
        card.style.transition = 'all 0.5s ease-out';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, 200 + (index * 100));
    });
  }

  /**
   * Account setup step animations
   */
  animateAccountStep(stepElement) {
    const formContainer = stepElement.querySelector('.form-container');
    
    if (formContainer) {
      formContainer.style.opacity = '0';
      formContainer.style.transform = 'translateY(20px)';
      
      setTimeout(() => {
        formContainer.style.transition = 'all 0.5s ease-out';
        formContainer.style.opacity = '1';
        formContainer.style.transform = 'translateY(0)';
      }, 200);
    }
  }

  /**
   * Preferences step animations
   */
  animatePreferencesStep(stepElement) {
    const preferenceCards = stepElement.querySelectorAll('.preference-card');
    
    preferenceCards.forEach((card, index) => {
      card.style.opacity = '0';
      card.style.transform = 'translateX(-20px)';
      
      setTimeout(() => {
        card.style.transition = 'all 0.4s ease-out';
        card.style.opacity = '1';
        card.style.transform = 'translateX(0)';
      }, 150 + (index * 100));
    });
  }

  /**
   * Import step animations
   */
  animateImportStep(stepElement) {
    const importCards = stepElement.querySelectorAll('.import-card');
    
    importCards.forEach((card, index) => {
      card.style.opacity = '0';
      card.style.transform = 'scale(0.95)';
      
      setTimeout(() => {
        card.style.transition = 'all 0.4s ease-out';
        card.style.opacity = '1';
        card.style.transform = 'scale(1)';
      }, 150 + (index * 100));
    });
  }

  /**
   * API configuration step animations
   */
  animateApiStep(stepElement) {
    const serviceCard = stepElement.querySelector('.service-card');
    const helpSection = stepElement.querySelector('.help-section');
    
    if (serviceCard) {
      serviceCard.style.opacity = '0';
      serviceCard.style.transform = 'translateY(20px)';
      
      setTimeout(() => {
        serviceCard.style.transition = 'all 0.5s ease-out';
        serviceCard.style.opacity = '1';
        serviceCard.style.transform = 'translateY(0)';
      }, 200);
    }
    
    if (helpSection) {
      helpSection.style.opacity = '0';
      
      setTimeout(() => {
        helpSection.style.transition = 'all 0.3s ease-out';
        helpSection.style.opacity = '1';
      }, 400);
    }
  }

  /**
   * Completion step animations
   */
  animateCompletionStep(stepElement) {
    const successIcon = stepElement.querySelector('.success-icon');
    const infoItems = stepElement.querySelectorAll('.info-item');
    const finalActions = stepElement.querySelector('.final-actions');
    
    if (successIcon) {
      successIcon.style.opacity = '0';
      successIcon.style.transform = 'scale(0.8)';
      
      setTimeout(() => {
        successIcon.style.transition = 'all 0.5s ease-out';
        successIcon.style.opacity = '1';
        successIcon.style.transform = 'scale(1)';
        successIcon.classList.add('animate-pulse');
      }, 200);
    }
    
    infoItems.forEach((item, index) => {
      item.style.opacity = '0';
      item.style.transform = 'translateY(20px)';
      
      setTimeout(() => {
        item.style.transition = 'all 0.4s ease-out';
        item.style.opacity = '1';
        item.style.transform = 'translateY(0)';
      }, 400 + (index * 150));
    });
    
    if (finalActions) {
      finalActions.style.opacity = '0';
      
      setTimeout(() => {
        finalActions.style.transition = 'all 0.5s ease-out';
        finalActions.style.opacity = '1';
      }, 800);
    }
  }

  /**
   * Animate form feedback messages
   * @param {HTMLElement} feedbackElement - Feedback element
   * @param {string} type - success, error, or warning
   */
  animateFeedback(feedbackElement, type) {
    if (!feedbackElement) return;
    
    // Remove any existing animation classes
    feedbackElement.classList.remove('animate-fadeIn', 'animate-slideInDown');
    
    // Add appropriate animation based on type
    feedbackElement.classList.add('animate-slideInDown');
    
    // Add color-specific animation for success
    if (type === 'success') {
      feedbackElement.style.animation = 'fadeIn 0.3s ease-out, pulse 0.6s ease-out 0.3s';
    }
  }

  /**
   * Animate progress bar updates
   */
  animateProgressUpdate() {
    const progressFill = document.getElementById('progressFill');
    if (progressFill) {
      progressFill.classList.add('progress-animated');
      
      setTimeout(() => {
        progressFill.classList.remove('progress-animated');
      }, 2000);
    }
  }

  /**
   * Animate import progress
   * @param {number} progress - Progress percentage (0-100)
   */
  animateImportProgress(progress) {
    const importProgressFill = document.getElementById('importProgressFill');
    if (importProgressFill) {
      importProgressFill.style.width = `${progress}%`;
    }
  }

  /**
   * Show/hide verification section with animation
   * @param {boolean} show - Whether to show or hide
   */
  toggleVerificationSection(show) {
    const verificationSection = document.getElementById('verificationSection');
    if (!verificationSection) return;
    
    if (show) {
      verificationSection.classList.remove('hidden');
      verificationSection.classList.add('animate-fadeInUp');
      
      setTimeout(() => {
        verificationSection.classList.remove('animate-fadeInUp');
      }, 500);
    } else {
      verificationSection.classList.add('animate-fadeOutDown');
      
      setTimeout(() => {
        verificationSection.classList.add('hidden');
        verificationSection.classList.remove('animate-fadeOutDown');
      }, 300);
    }
  }

  /**
   * Reset all step animations
   */
  resetAnimations() {
    const allSteps = document.querySelectorAll('.onboarding-step');
    
    allSteps.forEach(step => {
      step.classList.remove(
        'step-enter-forward',
        'step-enter-backward', 
        'step-exit-forward',
        'step-exit-backward'
      );
      
      // Reset child element animations
      const animatedElements = step.querySelectorAll('[style*="opacity"], [style*="transform"]');
      animatedElements.forEach(element => {
        element.style.opacity = '';
        element.style.transform = '';
        element.style.transition = '';
        element.style.animation = '';
      });
    });
  }

  /**
   * Add hover effects to interactive elements
   */
  addHoverEffects() {
    const hoverElements = document.querySelectorAll('.feature-card, .preference-card, .import-card, .service-card');
    
    hoverElements.forEach(element => {
      element.classList.add('hover-lift');
    });
  }

  /**
   * Remove all animations (for accessibility)
   */
  disableAnimations() {
    const style = document.createElement('style');
    style.textContent = `
      *, *::before, *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
      }
    `;
    document.head.appendChild(style);
  }
}

// Export for use in other modules
window.StepManager = StepManager;
