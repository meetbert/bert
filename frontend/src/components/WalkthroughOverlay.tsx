import { useEffect, useState, useRef, useCallback } from 'react';
import { useWalkthrough } from '@/contexts/WalkthroughContext';
import { useDemoData } from '@/contexts/DemoDataContext';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

export const WalkthroughOverlay = () => {
  const { isActive, step, currentStep, totalSteps, next, prev, skip } = useWalkthrough();
  const { stopDemo } = useDemoData();
  const [, forceUpdate] = useState(0);
  const rectRef = useRef<DOMRect | null>(null);
  const spotlightRef = useRef<HTMLDivElement>(null);
  const svgCutoutRef = useRef<SVGRectElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const handleSkip = useCallback(() => {
    skip();
    stopDemo();
  }, [skip, stopDemo]);

  const handleNext = useCallback(() => {
    if (currentStep === totalSteps - 1) {
      skip();
      stopDemo();
    } else {
      next();
    }
  }, [currentStep, totalSteps, next, skip, stopDemo]);

  // Directly update DOM elements for zero-lag tracking
  const applyRect = useCallback((r: DOMRect) => {
    const pad = 8;
    // Update SVG cutout
    if (svgCutoutRef.current) {
      svgCutoutRef.current.setAttribute('x', String(r.left - pad));
      svgCutoutRef.current.setAttribute('y', String(r.top - pad));
      svgCutoutRef.current.setAttribute('width', String(r.width + pad * 2));
      svgCutoutRef.current.setAttribute('height', String(r.height + pad * 2));
    }
    // Update spotlight ring
    if (spotlightRef.current) {
      spotlightRef.current.style.top = `${r.top - pad}px`;
      spotlightRef.current.style.left = `${r.left - pad}px`;
      spotlightRef.current.style.width = `${r.width + pad * 2}px`;
      spotlightRef.current.style.height = `${r.height + pad * 2}px`;
    }
    // Update tooltip position
    if (tooltipRef.current) {
      const spaceBelow = window.innerHeight - r.bottom;
      if (spaceBelow > 220) {
        tooltipRef.current.style.top = `${r.bottom + 16}px`;
        tooltipRef.current.style.left = `${Math.max(16, Math.min(r.left, window.innerWidth - 380))}px`;
        tooltipRef.current.style.transform = 'none';
      } else {
        tooltipRef.current.style.top = `${r.top - 16}px`;
        tooltipRef.current.style.left = `${Math.max(16, Math.min(r.left, window.innerWidth - 380))}px`;
        tooltipRef.current.style.transform = 'translateY(-100%)';
      }
    }
  }, []);

  useEffect(() => {
    if (!isActive || !step) return;

    rectRef.current = null;

    // Initial scroll: position element so tooltip + element are both visible
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        const absoluteTop = r.top + window.scrollY;
        // Place element at ~60% down the viewport, leaving room for tooltip above
        const targetY = absoluteTop - window.innerHeight * 0.45;
        window.scrollTo({ top: Math.max(0, targetY), behavior: 'smooth' });
      }
    }, 400);

    // RAF loop for continuous tracking
    let rafId: number;
    const track = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        rectRef.current = r;
        applyRect(r);
      }
      rafId = requestAnimationFrame(track);
    };

    // Start tracking after scroll settles
    const startRaf = setTimeout(() => {
      // Trigger one React render to show the overlay elements
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        rectRef.current = el.getBoundingClientRect();
      }
      forceUpdate(c => c + 1);
      rafId = requestAnimationFrame(track);
    }, 800);

    return () => {
      clearTimeout(timer);
      clearTimeout(startRaf);
      cancelAnimationFrame(rafId);
    };
  }, [isActive, step, currentStep, applyRect]);

  if (!isActive || !step) return null;

  const rect = rectRef.current;
  const isLastStep = currentStep === totalSteps - 1;

  // Initial tooltip position (will be overridden by RAF)
  const tooltipStyle: React.CSSProperties = {};
  if (rect) {
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow > 220) {
      tooltipStyle.top = rect.bottom + 16;
      tooltipStyle.left = Math.max(16, Math.min(rect.left, window.innerWidth - 380));
    } else {
      tooltipStyle.top = rect.top - 16;
      tooltipStyle.left = Math.max(16, Math.min(rect.left, window.innerWidth - 380));
      tooltipStyle.transform = 'translateY(-100%)';
    }
  } else {
    tooltipStyle.top = '50%';
    tooltipStyle.left = '50%';
    tooltipStyle.transform = 'translate(-50%, -50%)';
  }

  return (
    <>
      {/* Backdrop — SVG-based cutout for true transparency */}
      <svg className="fixed inset-0 z-[998] w-full h-full pointer-events-auto">
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                ref={svgCutoutRef}
                x={rect.left - 8}
                y={rect.top - 8}
                width={rect.width + 16}
                height={rect.height + 16}
                rx={12}
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect
          width="100%"
          height="100%"
          fill="hsl(var(--foreground) / 0.45)"
          mask="url(#tour-mask)"
        />
      </svg>

      {/* Spotlight ring */}
      {rect && (
        <div
          ref={spotlightRef}
          className="fixed z-[999] rounded-xl ring-2 ring-primary shadow-[0_0_0_4px_hsl(var(--primary)/0.2)] pointer-events-none"
          style={{
            top: rect.top - 8,
            left: rect.left - 8,
            width: rect.width + 16,
            height: rect.height + 16,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="fixed z-[1000] w-[360px] rounded-xl border bg-card p-5 shadow-2xl animate-in fade-in-0 zoom-in-95 duration-200"
        style={tooltipStyle}
      >
        <button
          onClick={handleSkip}
          className="absolute right-3 top-3 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <p className="text-[11px] font-medium text-primary">
            Quick tour · Step {currentStep + 1} of {totalSteps}
          </p>
        </div>

        <h3 className="text-base font-semibold text-card-foreground mb-1.5">{step.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mt-4 mb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep ? 'w-6 bg-primary' : i < currentStep ? 'w-1.5 bg-primary/40' : 'w-1.5 bg-border'
              }`}
            />
          ))}
        </div>

        <div className="flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={prev}
            disabled={currentStep === 0}
            className="gap-1"
          >
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">
              Skip tour
            </Button>
            <Button size="sm" onClick={handleNext} className="gap-1">
              {isLastStep ? 'Start using Bert' : 'Next'}
              {!isLastStep && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};
