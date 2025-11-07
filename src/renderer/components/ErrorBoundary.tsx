import { Component, ReactNode, ErrorInfo } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button } from '@/renderer/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/renderer/ui/card';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  containerClassName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null
    });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const containerClass = this.props.containerClassName || 'w-full h-full flex items-center justify-center p-4 bg-background';

      return (
        <div className={containerClass}>
          <Card className='max-w-4xl w-full h-[90%] overflow-hidden flex flex-col'>
            <CardHeader className='flex-shrink-0'>
              <div className='flex items-center gap-3'>
                <AlertCircle className='w-8 h-8 text-destructive' />
                <div>
                  <CardTitle>Something went wrong</CardTitle>
                  <CardDescription>
                    An error occurred while rendering this component
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className='space-y-4 flex-1 overflow-auto min-h-0'>
              {this.state.error && (
                <div className='space-y-2'>
                  <h3 className='font-semibold text-sm'>Error Message:</h3>
                  <pre className='p-3 bg-destructive/10 border border-destructive/20 rounded-md text-xs overflow-auto max-h-40 whitespace-pre-wrap break-words'>
                    {this.state.error.toString()}
                  </pre>
                </div>
              )}

              {this.state.errorInfo && (
                <div className='space-y-2 flex-1 min-h-0 flex flex-col'>
                  <h3 className='font-semibold text-sm flex-shrink-0'>Component Stack:</h3>
                  <pre className='p-3 bg-muted rounded-md text-xs overflow-auto flex-1 min-h-0'>
                    {this.state.errorInfo.componentStack}
                  </pre>
                </div>
              )}

              <div className='flex gap-3 pt-4'>
                <Button onClick={this.handleReset} className='flex items-center gap-2'>
                  <RefreshCw className='w-4 h-4' />
                  Try Again
                </Button>
                <Button 
                  variant='outline' 
                  onClick={() => window.location.reload()}
                >
                  Reload Page
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }else{
      return this.props.children;
    }
  }
}