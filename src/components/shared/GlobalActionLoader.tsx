
"use client";

import { useLoading } from '@/contexts/LoadingContext';
import AppLoader from './AppLoader';
import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';

const GlobalActionLoader: React.FC = () => {
  const { isLoading, hideLoading } = useLoading();
  const pathname = usePathname();
  const previousPathnameRef = useRef(pathname);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // 1. Hide loader when pathname changes (standard)
  useEffect(() => {
    if (isLoading && pathname !== previousPathnameRef.current) {
      hideLoading();
    }
    previousPathnameRef.current = pathname;
  }, [pathname, isLoading, hideLoading]);

  // 2. Safety Timeout: Don't let the loader stay forever (max 3 seconds)
  useEffect(() => {
    if (isLoading) {
      timeoutRef.current = setTimeout(() => {
        hideLoading();
      }, 3000); // 3 second safety limit
    } else if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [isLoading, hideLoading]);

  if (!isLoading) {
    return null;
  }

  return <AppLoader text="Ready in a moment..." />;
};

export default GlobalActionLoader;
