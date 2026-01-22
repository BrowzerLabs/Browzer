import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { ChevronRight, ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

// Import assets from the same directory
import aiLogoAnimation from './ai_logo.lottie';
import automationAnimation from './automation.lottie';
import aAnimation from './a.lottie';
import lockAnimation from './lock.lottie';
import aiCircleAnimation from './ai_circle.lottie';
import cosmicAudio from './cosmic.mp3';

import { useOnboardingStore } from '@/renderer/stores/onboardingStore';
import { Button } from '@/renderer/ui/button';

interface OnboardingSlide {
  title: string;
  description: string;
  animationPath: string;
}

const slides: OnboardingSlide[] = [
  {
    title: 'Welcome to Browzer',
    description:
      'Your intelligent browser that learns and automates your repetitive workflows.',
    animationPath: aiLogoAnimation,
  },
  {
    title: 'Record Your Processes',
    description:
      'Teach Browzer how you work, instead of letting AI assume "your" processes',
    animationPath: automationAnimation,
  },
  {
    title: 'Automate Your Tasks',
    description:
      'Browzer understands your workflows (truly), to automate them the way you do it!',
    animationPath: aAnimation,
  },
  {
    title: 'Privacy First',
    description: 'All while ensuring that your data stays locally!',
    animationPath: lockAnimation,
  },
  {
    title: 'Always Present',
    description:
      'Invoke with a click of the button to chat with your Browzer Assistant',
    animationPath: aiCircleAnimation,
  },
];

export function OnboardingFlow() {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [direction, setDirection] = useState(0);
  const navigate = useNavigate();
  const { completeOnboarding } = useOnboardingStore();
  const isLastSlide = currentSlide === slides.length - 1;
  const isFirstSlide = currentSlide === 0;

  useEffect(() => {
    const audio = new Audio(cosmicAudio);
    audio.loop = true;
    audio.volume = 0.2;
    const playPromise = audio.play();

    if (playPromise !== undefined) {
      playPromise.catch((error) => {
        console.log('Audio autoplay prevented:', error);
      });
    }

    return () => {
      audio.pause();
      audio.currentTime = 0;
    };
  }, []);

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
      setDirection(1);
      setCurrentSlide((prev) => prev + 1);
    }
  };

  const handlePrevious = () => {
    if (!isFirstSlide) {
      setDirection(-1);
      setCurrentSlide((prev) => prev - 1);
    }
  };

  const handleComplete = () => {
    completeOnboarding();
    navigate('/auth/signup');
  };

  const slide = slides[currentSlide];

  const slideVariants = {
    enter: (direction: number) => ({
      x: direction > 0 ? 100 : -100,
      opacity: 0,
    }),
    center: {
      zIndex: 1,
      x: 0,
      opacity: 1,
    },
    exit: (direction: number) => ({
      zIndex: 0,
      x: direction < 0 ? 100 : -100,
      opacity: 0,
    }),
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-background">
      <div className="flex flex-col items-center w-full max-w-4xl px-4">
        {/* Progress Indicators */}
        <div className="flex gap-2 mb-8">
          {slides.map((_, index) => (
            <motion.div
              key={index}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                index === currentSlide
                  ? 'w-8 bg-primary'
                  : index < currentSlide
                    ? 'w-6 bg-primary/50'
                    : 'w-6 bg-slate-700'
              }`}
              initial={{ scale: 0.8 }}
              animate={{ scale: index === currentSlide ? 1 : 0.8 }}
            />
          ))}
        </div>

        <AnimatePresence initial={false} custom={direction} mode="wait">
          <motion.div
            key={currentSlide}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              x: { type: 'spring', stiffness: 120, damping: 20 },
              opacity: { duration: 0.3 },
            }}
            className="flex flex-col items-center w-full"
          >
            <section className="h-[350px]">
              <DotLottieReact src={slide.animationPath} loop autoplay />
            </section>

            <h1 className="mt-10 mb-2 text-5xl text-slate-200 font-bold text-center">
              {slide.title}
            </h1>
            <p className="text-slate-400 text-sm text-center max-w-2xl">
              {slide.description}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="flex items-center justify-between fixed bottom-7 w-3xl">
        <Button
          variant="ghost"
          onClick={handlePrevious}
          disabled={isFirstSlide}
          size="lg"
        >
          <ChevronLeft className="w-5 h-5 mr-1 group-hover:text-white transition-colors" />
          <span>Previous</span>
        </Button>

        <Button onClick={handleNext} size="lg">
          {isLastSlide ? 'Get Started' : 'Continue'}
          <ChevronRight className="w-5 h-5" />
        </Button>
      </div>
    </div>
  );
}
