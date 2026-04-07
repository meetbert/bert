import React from 'react';

export function useScroll(threshold: number) {
  const [scrolled, setScrolled] = React.useState(false);

  React.useEffect(() => {
    const check = () => {
      const y = window.scrollY ?? window.pageYOffset ?? document.documentElement.scrollTop ?? 0;
      setScrolled(y > threshold);
    };

    window.addEventListener('scroll', check, { passive: true });
    document.addEventListener('scroll', check, { passive: true });
    check(); // run on mount

    return () => {
      window.removeEventListener('scroll', check);
      document.removeEventListener('scroll', check);
    };
  }, [threshold]);

  return scrolled;
}
