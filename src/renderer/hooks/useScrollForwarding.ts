import { useEffect } from 'react';

export function useScrollForwarding() {
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      const element = document.elementFromPoint(e.clientX, e.clientY);
      const isInteractive = !!element?.closest('.interactive-ui');
      if (!isInteractive) {
        window.browserAPI?.sendScrollEvent?.(
          e.deltaX,
          e.deltaY,
          e.clientX,
          e.clientY
        );
      }
    };

    window.addEventListener('wheel', handleWheel, { passive: true });

    return () => {
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);
}
