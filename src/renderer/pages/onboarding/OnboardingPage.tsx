import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/renderer/ui/button';
import { Card } from '@/renderer/ui/card';
import { useOnboardingStore } from '@/renderer/stores/onboardingStore';
import { 
  Bot, 
  Zap, 
  Shield, 
  ChevronRight, 
  ChevronLeft 
} from 'lucide-react';

/**
 * Onboarding Page - First-time user experience
 * 
 * Features:
 * - 3 slides showcasing key features
 * - Modern, minimalist design
 * - Progress indicators
 * - Skip option
 */

interface OnboardingSlide {
  icon: React.ReactNode;
  title: string;
  description: string;
  gradient: string;
}

const slides: OnboardingSlide[] = [
  {
    icon: <Bot className="size-16" />,
    title: 'AI-Powered Browsing',
    description: 'Experience the future of web browsing with intelligent automation and AI assistance at your fingertips.',
    gradient: 'from-blue-500 to-cyan-500',
  },
  {
    icon: <Zap className="size-16" />,
    title: 'Automate Workflows',
    description: 'Record, replay, and automate repetitive tasks. Save time and boost productivity with smart automation.',
    gradient: 'from-purple-500 to-pink-500',
  },
  {
    icon: <Shield className="size-16" />,
    title: 'Secure & Private',
    description: 'Your data stays yours. Built with privacy-first architecture and enterprise-grade security.',
    gradient: 'from-emerald-500 to-teal-500',
  },
];

export function OnboardingPage() {
  const navigate = useNavigate();
  const { completeOnboarding } = useOnboardingStore();
  const [currentSlide, setCurrentSlide] = useState(0);

  const isLastSlide = currentSlide === slides.length - 1;
  const isFirstSlide = currentSlide === 0;

  const handleNext = () => {
    if (isLastSlide) {
      handleComplete();
    } else {
      setCurrentSlide((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstSlide) {
      setCurrentSlide((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    completeOnboarding();
    navigate('/auth/signin');
  };

  const handleSkip = () => {
    completeOnboarding();
    navigate('/auth/signin');
  };

  const slide = slides[currentSlide];

  return (
    <div className="h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <div className="w-full max-w-2xl px-6">
        {/* Skip Button */}
        <div className="flex justify-end mb-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSkip}
            className="text-slate-600 dark:text-slate-400"
          >
            Skip
          </Button>
        </div>

        {/* Main Card */}
        <Card className="p-12 shadow-2xl">
          {/* Icon with Gradient Background */}
          <div className="flex justify-center mb-8">
            <div
              className={`p-6 rounded-2xl bg-gradient-to-br ${slide.gradient} text-white shadow-lg`}
            >
              {slide.icon}
            </div>
          </div>

          {/* Content */}
          <div className="text-center space-y-4 mb-12">
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">
              {slide.title}
            </h1>
            <p className="text-lg text-slate-600 dark:text-slate-400 max-w-md mx-auto">
              {slide.description}
            </p>
          </div>

          {/* Progress Indicators */}
          <div className="flex justify-center gap-2 mb-8">
            {slides.map((_, index) => (
              <button
                key={index}
                onClick={() => setCurrentSlide(index)}
                className={`h-2 rounded-full transition-all ${
                  index === currentSlide
                    ? 'w-8 bg-blue-600'
                    : 'w-2 bg-slate-300 dark:bg-slate-700 hover:bg-slate-400 dark:hover:bg-slate-600'
                }`}
                aria-label={`Go to slide ${index + 1}`}
              />
            ))}
          </div>

          {/* Navigation Buttons */}
          <div className="flex items-center justify-between gap-4">
            <Button
              variant="outline"
              onClick={handlePrevious}
              disabled={isFirstSlide}
              className="w-32"
            >
              <ChevronLeft className="size-4 mr-2" />
              Previous
            </Button>

            <Button
              onClick={handleNext}
              className="w-32"
            >
              {isLastSlide ? (
                'Get Started'
              ) : (
                <>
                  Next
                  <ChevronRight className="size-4 ml-2" />
                </>
              )}
            </Button>
          </div>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-sm text-slate-500 dark:text-slate-500">
          {currentSlide + 1} of {slides.length}
        </div>
      </div>
    </div>
  );
}
