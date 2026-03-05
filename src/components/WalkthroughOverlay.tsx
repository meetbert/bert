import { useEffect, useState, useRef } from 'react';
import { useWalkthrough } from '@/contexts/WalkthroughContext';
import { Button } from '@/components/ui/button';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';

export const WalkthroughOverlay = () => {
  const { isActive, step, currentStep, totalSteps, next, prev, skip } = useWalkthrough();
  const [rect, setRect] = useState<DOMRect | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive || !step) return;

    const find = () => {
      const el = document.querySelector(`[data-tour="${step.target}"]`);
      if (el) {
        const r = el.getBoundingClientRect();
        setRect(r);
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        setRect(null);
      }
    };

    // Small delay to let page render after navigation
    const timer = setTimeout(find, 400);
    return () => clearTimeout(timer);
  }, [isActive, step, currentStep]);

  if (!isActive || !step) return null;

  // Position tooltip below or above the target
  const tooltipStyle: React.CSSProperties = {};
  if (rect) {
    const spaceBelow = window.innerHeight - rect.bottom;
    if (spaceBelow > 200) {
      tooltipStyle.top = rect.bottom + 12;
      tooltipStyle.left = Math.max(16, Math.min(rect.left, window.innerWidth - 380));
    } else {
      tooltipStyle.top = rect.top - 12;
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
      {/* Backdrop */}
      <div className="fixed inset-0 z-[998] bg-foreground/40 transition-opacity" onClick={skip} />

      {/* Spotlight cutout */}
      {rect && (
        <div
          className="fixed z-[999] rounded-lg ring-4 ring-primary/60 pointer-events-none transition-all duration-300"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        ref={tooltipRef}
        className="fixed z-[1000] w-[360px] rounded-xl border bg-card p-5 shadow-xl animate-in fade-in-0 zoom-in-95 duration-200"
        style={tooltipStyle}
      >
        <button
          onClick={skip}
          className="absolute right-3 top-3 rounded-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-xs font-medium text-primary mb-1">
          Step {currentStep + 1} of {totalSteps}
        </p>
        <h3 className="text-base font-semibold text-card-foreground mb-1.5">{step.title}</h3>
        <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>

        {/* Progress dots */}
        <div className="flex items-center gap-1.5 mt-4 mb-4">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === currentStep ? 'w-6 bg-primary' : 'w-1.5 bg-border'
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
            <Button variant="ghost" size="sm" onClick={skip} className="text-muted-foreground">
              Skip tour
            </Button>
            <Button size="sm" onClick={next} className="gap-1">
              {currentStep === totalSteps - 1 ? 'Finish' : 'Next'} 
              {currentStep < totalSteps - 1 && <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};
