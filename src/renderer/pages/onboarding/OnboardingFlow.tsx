import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { Button } from '@/renderer/ui/button';
import { Card } from '@/renderer/ui/card';
import { ChevronRight, ChevronLeft, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useOnboardingStore } from '@/renderer/stores/onboardingStore';
import { cn } from '@/renderer/lib/utils';

interface OnboardingSlide {
  title: string;
  description: string;
  animationPath: string;
  accentColor: string;
  gradientFrom: string;
  gradientTo: string;
}

const slides: OnboardingSlide[] = [
  {
    title: 'Welcome to Browzer',
    description: 'Your intelligent browser that learns from your actions and automates repetitive tasks.',
    animationPath: '/assets/onboarding/ai_logo.lottie',
    accentColor: '#3b82f6',
    gradientFrom: '#3b82f6',
    gradientTo: '#06b6d4',
  },
  {
    title: 'Record Your Actions',
    description: 'Browzer captures your actions, not just screen',
    animationPath: '/assets/onboarding/automation.lottie',
    accentColor: '#a855f7',
    gradientFrom: '#a855f7',
    gradientTo: '#ec4899',
  },
  {
    title: 'Browzer Automation',
    description: 'Our AI understands your workflows and automates your tasks in your way',
    animationPath: '/assets/onboarding/a.lottie',
    accentColor: '#10b981',
    gradientFrom: '#10b981',
    gradientTo: '#06b6d4',
  },
  {
    title: 'Always there',
    description: 'Always there with you in your right sidebar.',
    animationPath: '/assets/onboarding/ai_circle.lottie',
    accentColor: '#10b981',
    gradientFrom: '#10b981',
    gradientTo: '#06b6d4',
  },
];

export function OnboardingFlow() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const navigate = useNavigate();
  const { completeOnboarding } = useOnboardingStore();

  const isLastSlide = currentSlide === slides.length - 1;
  const isFirstSlide = currentSlide === 0;

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && !isLastSlide) {
        handleNext();
      } else if (e.key === 'ArrowLeft' && !isFirstSlide) {
        handlePrevious();
      } else if (e.key === 'Enter' && isLastSlide) {
        handleComplete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide, isLastSlide, isFirstSlide]);

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
    navigate('/auth/signup');
  };

  const slide = slides[currentSlide];

  return (
    <div className="min-h-screen relative flex items-center justify-center">
        <div className="flex flex-col items-center">
                <section className='h-[350px]'>
                   <DotLottieReact
                    src={slide.animationPath}
                    loop
                    autoplay
                  />
                </section>
                  
                  <h1 className='mt-10 mb-2 text-5xl text-slate-200 font-bold'>
                    {slide.title}
                  </h1>
                  <p className='text-slate-400 text-sm'>{slide.description}</p>

            </div>

          
            <div className="flex items-center justify-between fixed bottom-7 w-3xl">
              <Button
                  variant="ghost"
                  onClick={handlePrevious}
                  disabled={isFirstSlide}
                  size='lg'
                >
                    <ChevronLeft className="w-5 h-5 mr-1 group-hover:text-white transition-colors" />
                    <span>Previous</span>
                </Button>


            <Button
              onClick={handleNext}
              size='lg'
              className={cn(
                isLastSlide && 'bg-cyan-500'
              )}
            >
              {isLastSlide ? (
                'Get Started'
                ) : (
                 'Continue'
                )}
                <ChevronRight className="w-5 h-5" />
            </Button>
            </div>
    </div>
  );
}
