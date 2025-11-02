import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export function useDeepLink() {
  const navigate = useNavigate();

  useEffect(() => {
    const unsubscribe = window.browserAPI.onDeepLink(async (path: string) => {
      
      await window.browserAPI.hideAllTabs();
      navigate(path);
    });

    return unsubscribe;
  }, [navigate]);
}
