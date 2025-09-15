/**
 * Main entry point for onboarding application
 * Initializes the onboarding flow and handles global events
 */

// Global onboarding manager instance
let onboardingManager = null;

/**
 * Initialize the onboarding application
 */
function initializeOnboarding() {
  // Check if we're in the right environment
  if (typeof window === 'undefined') {
    console.error('Onboarding must run in a browser environment');
    return;
  }

  // Check for required dependencies
  if (!window.OnboardingManager || !window.StepManager || !window.FormValidator || !window.ApiService) {
    console.error('Required onboarding modules not loaded');
    return;
  }

  try {
    // Create the main onboarding manager
    onboardingManager = new OnboardingManager();
    
    // Make it globally available for debugging
    window.onboardingManager = onboardingManager;
    
    console.log('🚀 Onboarding application initialized');
    
  } catch (error) {
    console.error('Failed to initialize onboarding:', error);
    showErrorMessage('Failed to initialize onboarding. Please refresh the page.');
  }
}

/**
 * Handle global errors
 */
function setupErrorHandling() {
  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event) => {
    console.error('Unhandled promise rejection:', event.reason);
    
    // Show user-friendly error message
    showErrorMessage('An unexpected error occurred. Please try again.');
    
    // Prevent the default browser error handling
    event.preventDefault();
  });

  // Handle general JavaScript errors
  window.addEventListener('error', (event) => {
    console.error('JavaScript error:', event.error);
    
    // Don't show error for minor issues
    if (event.error && event.error.name !== 'TypeError') {
      showErrorMessage('An error occurred. Please refresh the page if issues persist.');
    }
  });
}

/**
 * Setup accessibility features
 */
function setupAccessibility() {
  // Check for reduced motion preference
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  
  if (prefersReducedMotion) {
    document.body.classList.add('reduced-motion');
    console.log('🎯 Reduced motion mode enabled');
  }

  // Setup focus management
  setupFocusManagement();
  
  // Setup keyboard navigation
  setupKeyboardNavigation();
}

/**
 * Setup focus management for accessibility
 */
function setupFocusManagement() {
  // Trap focus within the onboarding modal
  const onboardingApp = document.querySelector('.onboarding-app');
  if (!onboardingApp) return;

  const focusableElements = onboardingApp.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  if (focusableElements.length === 0) return;

  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  // Focus first element on load
  setTimeout(() => {
    firstFocusable.focus();
  }, 500);

  // Trap focus within the modal
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;

    if (e.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstFocusable) {
        e.preventDefault();
        lastFocusable.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastFocusable) {
        e.preventDefault();
        firstFocusable.focus();
      }
    }
  });
}

/**
 * Setup keyboard navigation
 */
function setupKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    // Don't interfere if user is typing in an input
    if (e.target.matches('input, textarea, select')) {
      return;
    }

    switch (e.key) {
      case 'Enter':
      case ' ':
        // Activate focused button or interactive element
        if (e.target.matches('button, .import-card, .preference-card')) {
          e.preventDefault();
          e.target.click();
        }
        break;
        
      case 'ArrowRight':
      case 'ArrowDown':
        // Navigate forward
        if (onboardingManager && !onboardingManager.isTransitioning) {
          e.preventDefault();
          onboardingManager.nextStep();
        }
        break;
        
      case 'ArrowLeft':
      case 'ArrowUp':
        // Navigate backward
        if (onboardingManager && !onboardingManager.isTransitioning) {
          e.preventDefault();
          onboardingManager.previousStep();
        }
        break;
        
      case 'Home':
        // Go to first step
        if (onboardingManager && !onboardingManager.isTransitioning) {
          e.preventDefault();
          onboardingManager.goToStep(1);
        }
        break;
        
      case 'End':
        // Go to last step
        if (onboardingManager && !onboardingManager.isTransitioning) {
          e.preventDefault();
          onboardingManager.goToStep(onboardingManager.totalSteps);
        }
        break;
    }
  });
}

/**
 * Show error message to user
 * @param {string} message - Error message to display
 */
function showErrorMessage(message) {
  // Remove any existing error messages
  const existingError = document.querySelector('.error-message');
  if (existingError) {
    existingError.remove();
  }

  // Create error message element
  const errorElement = document.createElement('div');
  errorElement.className = 'error-message';
  errorElement.innerHTML = `
    <div class="error-content">
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </svg>
      <p>${message}</p>
      <button onclick="this.parentElement.parentElement.remove()" class="error-close">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="18" y1="6" x2="6" y2="18"/>
          <line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  `;

  // Add styles
  errorElement.style.cssText = `
    position: fixed;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 10000;
    background: var(--error-50);
    border: 1px solid var(--error-500);
    border-radius: var(--radius-lg);
    padding: var(--space-4);
    box-shadow: var(--shadow-lg);
    max-width: 400px;
    animation: slideInDown 0.3s ease-out;
  `;

  errorElement.querySelector('.error-content').style.cssText = `
    display: flex;
    align-items: center;
    gap: var(--space-3);
    color: var(--error-600);
  `;

  errorElement.querySelector('svg').style.cssText = `
    flex-shrink: 0;
  `;

  errorElement.querySelector('p').style.cssText = `
    margin: 0;
    flex: 1;
    font-size: var(--font-size-sm);
    font-weight: var(--font-weight-medium);
  `;

  errorElement.querySelector('.error-close').style.cssText = `
    background: none;
    border: none;
    cursor: pointer;
    padding: var(--space-1);
    border-radius: var(--radius-sm);
    color: var(--error-500);
    display: flex;
    align-items: center;
    justify-content: center;
  `;

  // Add to page
  document.body.appendChild(errorElement);

  // Auto-remove after 5 seconds
  setTimeout(() => {
    if (errorElement.parentElement) {
      errorElement.style.animation = 'slideOutUp 0.3s ease-in';
      setTimeout(() => errorElement.remove(), 300);
    }
  }, 5000);
}

/**
 * Setup performance monitoring
 */
function setupPerformanceMonitoring() {
  // Monitor page load performance
  window.addEventListener('load', () => {
    const perfData = performance.getEntriesByType('navigation')[0];
    if (perfData) {
      console.log('📊 Page load performance:', {
        loadTime: Math.round(perfData.loadEventEnd - perfData.loadEventStart),
        domContentLoaded: Math.round(perfData.domContentLoadedEventEnd - perfData.domContentLoadedEventStart),
        totalTime: Math.round(perfData.loadEventEnd - perfData.fetchStart)
      });
    }
  });

  // Monitor memory usage (if available)
  if (performance.memory) {
    setInterval(() => {
      const memInfo = performance.memory;
      if (memInfo.usedJSHeapSize > memInfo.jsHeapSizeLimit * 0.9) {
        console.warn('⚠️ High memory usage detected');
      }
    }, 30000); // Check every 30 seconds
  }
}

/**
 * Setup theme detection
 */
function setupThemeDetection() {
  // Detect system theme preference
  const darkModeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  
  function updateTheme(e) {
    if (e.matches) {
      document.body.classList.add('dark-theme');
      console.log('🌙 Dark theme detected');
    } else {
      document.body.classList.remove('dark-theme');
      console.log('☀️ Light theme detected');
    }
  }
  
  // Initial theme check
  updateTheme(darkModeQuery);
  
  // Listen for theme changes
  darkModeQuery.addEventListener('change', updateTheme);
}

/**
 * Main initialization function
 */
function main() {
  console.log('🎯 Starting onboarding application...');
  
  // Setup global error handling first
  setupErrorHandling();
  
  // Setup accessibility features
  setupAccessibility();
  
  // Setup performance monitoring
  setupPerformanceMonitoring();
  
  // Setup theme detection
  setupThemeDetection();
  
  // Initialize the main application
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeOnboarding);
  } else {
    initializeOnboarding();
  }
}

// Start the application
main();

// Export for external access
window.onboardingApp = {
  manager: () => onboardingManager,
  showError: showErrorMessage,
  version: '1.0.0'
};
