import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UpdateInfo, UpdateProgress } from '@/shared/types';
import { Button } from '@/renderer/ui/button';
import { Progress } from '@/renderer/ui/progress';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/renderer/ui/card';
import { Alert, AlertDescription } from '@/renderer/ui/alert';
import { Download, CheckCircle2, XCircle, RefreshCw, Rocket } from 'lucide-react';

type UpdateState = 
  | 'checking' 
  | 'available' 
  | 'downloading' 
  | 'downloaded' 
  | 'error' 
  | 'not-available';

export function UpdatePage() {
  const navigate = useNavigate();
  const [updateState, setUpdateState] = useState<UpdateState>('checking');
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string>('');
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);

  useEffect(() => {
    // Hide all browser tabs when on update page
    window.browserAPI.hideAllTabs();

    // Get current version
    window.updaterAPI.getVersion().then(setCurrentVersion);

    // Set up event listeners
    const unsubChecking = window.updaterAPI.onUpdateChecking(() => {
      setUpdateState('checking');
      setError(null);
    });

    const unsubAvailable = window.updaterAPI.onUpdateAvailable((info) => {
      setUpdateState('available');
      setUpdateInfo(info);
      setCurrentVersion(info.currentVersion);
      // Automatically start download
      startDownload();
    });

    const unsubNotAvailable = window.updaterAPI.onUpdateNotAvailable(() => {
      setUpdateState('not-available');
      // Redirect back after 3 seconds
      setTimeout(() => {
        window.browserAPI.showAllTabs();
        navigate('/');
      }, 3000);
    });

    const unsubDownloadStarted = window.updaterAPI.onDownloadStarted(() => {
      setUpdateState('downloading');
    });

    const unsubProgress = window.updaterAPI.onDownloadProgress((progress) => {
      setDownloadProgress(progress);
    });

    const unsubDownloaded = window.updaterAPI.onUpdateDownloaded((info) => {
      setUpdateState('downloaded');
      setUpdateInfo(info);
    });

    const unsubError = window.updaterAPI.onUpdateError((err) => {
      setUpdateState('error');
      setError(err.message || 'An unknown error occurred');
    });

    // Cleanup
    return () => {
      unsubChecking();
      unsubAvailable();
      unsubNotAvailable();
      unsubDownloadStarted();
      unsubProgress();
      unsubDownloaded();
      unsubError();
    };
  }, [navigate]);

  const startDownload = async () => {
    try {
      const result = await window.updaterAPI.downloadUpdate();
      if (!result.success && result.error) {
        setError(result.error);
        setUpdateState('error');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start download');
      setUpdateState('error');
    }
  };

  const handleInstall = async () => {
    setIsInstalling(true);
    try {
      await window.updaterAPI.installUpdate();
      // App will restart, so this won't execute
    } catch (err) {
      setIsInstalling(false);
      setError(err instanceof Error ? err.message : 'Failed to install update');
      setUpdateState('error');
    }
  };

  const handleCancel = () => {
    window.browserAPI.showAllTabs();
    navigate('/');
  };

  const handleRetry = () => {
    setError(null);
    setUpdateState('checking');
    window.updaterAPI.checkForUpdates();
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 flex items-center justify-center p-6">
      <Card className="w-full max-w-2xl shadow-2xl">
        <CardHeader className="text-center space-y-2">
          <div className="mx-auto w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            {updateState === 'checking' && <RefreshCw className="w-8 h-8 text-primary animate-spin" />}
            {updateState === 'available' && <Download className="w-8 h-8 text-primary" />}
            {updateState === 'downloading' && <Download className="w-8 h-8 text-primary animate-pulse" />}
            {updateState === 'downloaded' && <CheckCircle2 className="w-8 h-8 text-green-500" />}
            {updateState === 'error' && <XCircle className="w-8 h-8 text-red-500" />}
            {updateState === 'not-available' && <CheckCircle2 className="w-8 h-8 text-green-500" />}
          </div>
          
          <CardTitle className="text-3xl font-bold">
            {updateState === 'checking' && 'Checking for Updates'}
            {updateState === 'available' && 'Update Available'}
            {updateState === 'downloading' && 'Downloading Update'}
            {updateState === 'downloaded' && 'Update Ready'}
            {updateState === 'error' && 'Update Failed'}
            {updateState === 'not-available' && 'You\'re Up to Date'}
          </CardTitle>
          
          <CardDescription className="text-base">
            {updateState === 'checking' && 'Please wait while we check for the latest version...'}
            {updateState === 'available' && `A new version of Browzer is available`}
            {updateState === 'downloading' && 'Downloading the latest version...'}
            {updateState === 'downloaded' && 'The update has been downloaded and is ready to install'}
            {updateState === 'error' && 'Something went wrong during the update process'}
            {updateState === 'not-available' && 'You have the latest version of Browzer'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Version Info */}
          {currentVersion && (
            <div className="flex justify-center gap-8 text-sm">
              <div className="text-center">
                <p className="text-muted-foreground mb-1">Current Version</p>
                <p className="font-semibold text-lg">{currentVersion}</p>
              </div>
              {updateInfo && (
                <>
                  <div className="flex items-center">
                    <div className="w-8 h-px bg-border"></div>
                    <Rocket className="w-4 h-4 mx-2 text-primary" />
                    <div className="w-8 h-px bg-border"></div>
                  </div>
                  <div className="text-center">
                    <p className="text-muted-foreground mb-1">New Version</p>
                    <p className="font-semibold text-lg text-primary">{updateInfo.version}</p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Download Progress */}
          {updateState === 'downloading' && downloadProgress && (
            <div className="space-y-3">
              <Progress value={downloadProgress.percent} className="h-3" />
              <div className="flex justify-between text-sm text-muted-foreground">
                <span>{downloadProgress.percent.toFixed(1)}% complete</span>
                <span>{downloadProgress.speedFormatted}</span>
              </div>
              <div className="text-center text-xs text-muted-foreground">
                {downloadProgress.transferredFormatted} of {downloadProgress.totalFormatted}
              </div>
            </div>
          )}

          {/* Release Notes */}
          {updateInfo?.releaseNotes && (updateState === 'available' || updateState === 'downloading' || updateState === 'downloaded') && (
            <div className="bg-muted/50 rounded-lg p-4 max-h-48 overflow-y-auto">
              <h4 className="font-semibold mb-2 text-sm">What's New:</h4>
              <div className="text-sm text-muted-foreground prose prose-sm dark:prose-invert max-w-none">
                {typeof updateInfo.releaseNotes === 'string' ? (
                  <p className="whitespace-pre-wrap">{updateInfo.releaseNotes}</p>
                ) : (
                  <div dangerouslySetInnerHTML={{ __html: updateInfo.releaseNotes as string }} />
                )}
              </div>
            </div>
          )}

          {/* Error Alert */}
          {error && updateState === 'error' && (
            <Alert variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold mb-1">Update Error</p>
                <p className="text-sm">{error}</p>
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            {updateState === 'downloaded' && (
              <>
                <Button
                  onClick={handleInstall}
                  disabled={isInstalling}
                  className="flex-1"
                  size="lg"
                >
                  {isInstalling ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Installing...
                    </>
                  ) : (
                    <>
                      <Rocket className="w-4 h-4 mr-2" />
                      Install & Restart
                    </>
                  )}
                </Button>
                <Button
                  onClick={handleCancel}
                  variant="outline"
                  disabled={isInstalling}
                  size="lg"
                >
                  Later
                </Button>
              </>
            )}

            {updateState === 'error' && (
              <>
                <Button onClick={handleRetry} className="flex-1" size="lg">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
                <Button onClick={handleCancel} variant="outline" size="lg">
                  Cancel
                </Button>
              </>
            )}

            {updateState === 'checking' && (
              <Button onClick={handleCancel} variant="outline" className="w-full" size="lg">
                Cancel
              </Button>
            )}

            {updateState === 'not-available' && (
              <Button onClick={handleCancel} className="w-full" size="lg">
                <CheckCircle2 className="w-4 h-4 mr-2" />
                Continue
              </Button>
            )}
          </div>

          {/* Additional Info */}
          {updateState === 'downloading' && (
            <p className="text-xs text-center text-muted-foreground">
              Please don't close the application while the update is downloading
            </p>
          )}
          
          {updateState === 'downloaded' && (
            <p className="text-xs text-center text-muted-foreground">
              The app will restart automatically after installation
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
