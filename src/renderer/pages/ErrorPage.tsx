import { useEffect, useState } from 'react';
import { Button } from '@/renderer/ui/button';
import { 
  RefreshCw, 
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Settings,
  TriangleAlert,
} from 'lucide-react';
import { ErrorPageData, isSecurityError } from '@/shared/errorPages';
import { toast } from 'sonner';


export function ErrorPage() {
  const [showDetails, setShowDetails] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [errorData, setErrorData] = useState<ErrorPageData | null>(null);
  
  useEffect(() => {
    const parseErrorData = () => {
      const hash = window.location.hash;
      const queryStart = hash.indexOf('?');
      if (queryStart === -1) return null;
      
      const queryString = hash.substring(queryStart + 1);
      const params = new URLSearchParams(queryString);
      const encodedData = params.get('data');
      
      if (!encodedData) return null;
      
      try {
        const decoded = atob(encodedData);
        return JSON.parse(decoded) as ErrorPageData;
      } catch (e) {
        console.error('[ErrorPage] Failed to parse error data:', e);
        return null;
      }
    };
    
    setErrorData(parseErrorData());
    
    const handleHashChange = () => {
      setErrorData(parseErrorData());
    };
    
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const handleRetry = async () => {
    if (!errorData?.url){
      toast('URL to reload not found');
      return;
    }
    
    setIsRetrying(true);
    try {
      const { activeTabId } = await window.browserAPI.getTabs();
      if (activeTabId) {
        await window.browserAPI.navigate(activeTabId, errorData.url);
      }
    } catch (e) {
      console.error('[ErrorPage] Retry failed:', e);
    } finally {
      setIsRetrying(false);
    }
  };

  const handleOpenSettings = () => {
    window.browserAPI.navigate('', 'browzer://settings');
  };

  if (!errorData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8">
        <AlertTriangle className="w-16 h-16 text-muted-foreground mb-4" />
        <h1 className="text-2xl font-semibold text-foreground mb-2">Something went wrong</h1>
        <p className="text-muted-foreground">Unable to display error information.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-background p-8 select-none">
      <TriangleAlert className="w-16 h-16 text-muted-foreground mb-4" />
      <h1 className="text-2xl font-semibold text-foreground mb-2 text-center">
        {errorData.title}
      </h1>
      
      <p className="text-muted-foreground text-center max-w-md text-xs mb-1">
        {errorData.description}
      </p>
      
      <div className="flex items-center gap-2 mb-20">
        <span className="px-3 py-1 bg-muted rounded-full text-sm text-muted-foreground font-mono">
          {errorData.errorName}
        </span>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        {errorData.canRetry && (
          <Button 
            onClick={handleRetry} 
            disabled={isRetrying}
            className="min-w-[140px]"
          >
            {isRetrying ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                Retrying...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Try again
              </>
            )}
          </Button>
        )}
        
        {errorData.showDiagnostics && (
          <Button variant="outline" onClick={handleOpenSettings}>
            <Settings className="w-4 h-4 mr-2" />
            Settings
          </Button>
        )}
      </div>
      
      {errorData.suggestions.length > 0 && (
        <div className="w-full max-w-md">
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
          >
            {showDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
            {showDetails ? 'Hide details' : 'Show details'}
          </button>
          
          {showDetails && (
            <div className="bg-muted/50 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">
                Try the following:
              </p>
              <ul className="space-y-2">
                {errorData.suggestions.map((suggestion, index) => (
                  <li 
                    key={index}
                    className="flex items-start gap-2 text-sm text-muted-foreground"
                  >
                    <span className="text-primary mt-0.5">•</span>
                    {suggestion}
                  </li>
                ))}
              </ul>
              
              {isSecurityError(errorData.errorCode) && (
                <div className="mt-4 pt-4 border-t border-border">
                  <p className="text-xs text-muted-foreground">
                    <strong>Warning:</strong> Proceeding to this site may expose your personal 
                    information to attackers. Only proceed if you understand the risks.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
      
      <p className="text-xs text-muted-foreground/50 mt-8">
        Error occurred at {new Date(errorData.timestamp).toLocaleTimeString()}
      </p>
    </div>
  );
}

export default ErrorPage;
