import { useEffect, useRef } from 'react';
import {
  Loader2,
  ExternalLink,
  CheckCircle2,
  XCircle,
  Plug2,
  RefreshCw,
  Database,
  Clock,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/renderer/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/renderer/ui/card';
import {
  Field,
  FieldGroup,
  FieldLabel,
  FieldDescription,
  FieldContent,
} from '@/renderer/ui/field';
import { useIntegrationStore } from '@/renderer/stores/integrationStore';

function NotionLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M4.459 4.208c.746.606 1.026.56 2.428.466l13.215-.793c.28 0 .047-.28-.046-.326L17.86 1.968c-.42-.326-.98-.7-2.055-.607L3.01 2.295c-.466.046-.56.28-.374.466zm.793 3.08v13.904c0 .747.373 1.027 1.214.98l14.523-.84c.841-.046.935-.56.935-1.167V6.354c0-.606-.233-.933-.748-.886l-15.177.887c-.56.047-.747.327-.747.933zm14.337.745c.093.42 0 .84-.42.888l-.7.14v10.264c-.608.327-1.168.514-1.635.514-.748 0-.935-.234-1.495-.933l-4.577-7.186v6.952l1.448.327s0 .84-1.168.84l-3.22.186c-.094-.186 0-.653.327-.746l.84-.233V9.854L7.822 9.76c-.094-.42.14-1.026.793-1.073l3.453-.233 4.764 7.279v-6.44l-1.215-.14c-.093-.514.28-.886.747-.933zM2.222 1.061L16.152.028c1.681-.14 2.101.186 2.802.7l3.873 2.706c.466.326.606.7.606 1.166v15.27c0 .98-.373 1.54-1.682 1.634L5.898 22.448c-.98.047-1.448-.093-1.962-.747L1.166 18.62c-.56-.746-.793-1.306-.793-1.958V2.34c0-.84.373-1.447 1.354-1.634z" />
    </svg>
  );
}

export function IntegrationSettings() {
  const {
    notion,
    notionSync,
    setNotionState,
    setNotionLoading,
    setNotionConnected,
    setNotionError,
    clearNotionConnection,
    initialized,
    setInitialized,
    setNotionSyncState,
    startNotionSync,
    completeSyncSuccess,
    completeSyncError,
  } = useIntegrationStore();

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!initialized) {
      loadNotionState();
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [initialized]);

  const loadNotionState = async () => {
    try {
      setNotionLoading(true);
      const state = await window.notionAPI.getConnectionState();

      if (state.isConnected && state.workspace && state.owner) {
        setNotionConnected(state.workspace, state.owner);

        const serverStatus = await window.notionAPI.getServerStatus();
        if (serverStatus.isConnected) {
          setNotionSyncState({
            syncStatus: serverStatus.syncStatus || null,
            lastSyncAt: serverStatus.lastSyncAt || null,
            totalDocuments: serverStatus.totalDocuments || 0,
            syncError: serverStatus.syncError || null,
          });

          // Resume polling if a sync is already in progress
          const isActiveSyncStatus =
            serverStatus.syncStatus &&
            serverStatus.syncStatus !== 'completed' &&
            serverStatus.syncStatus !== 'failed';

          if (isActiveSyncStatus && !pollIntervalRef.current) {
            startNotionSync();
            pollIntervalRef.current = setInterval(pollSyncStatus, 5000);
          }
        }
      } else {
        clearNotionConnection();
      }
      setInitialized(true);
    } catch (error) {
      console.error('Failed to load Notion state:', error);
      setNotionError('Failed to load connection state');
      setInitialized(true);
    }
  };

  const handleConnectNotion = async () => {
    try {
      setNotionState({ isLoading: true, error: null });

      const response = await window.notionAPI.connect();

      if (response.success && response.data) {
        setNotionConnected(
          {
            id: response.data.workspace_id,
            name: response.data.workspace_name || 'Unknown Workspace',
            icon: response.data.workspace_icon,
          },
          response.data.owner
        );
        toast.success('Connected to Notion successfully');
      } else {
        const errorMessage =
          response.error?.message || 'Failed to connect to Notion';
        setNotionError(errorMessage);

        if (response.error?.code !== 'OAUTH_CANCELLED') {
          toast.error(errorMessage);
        }
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to connect to Notion';
      setNotionError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const handleDisconnectNotion = async () => {
    try {
      setNotionLoading(true);

      const response = await window.notionAPI.disconnect();

      if (response.success) {
        clearNotionConnection();
        toast.success('Disconnected from Notion');
      } else {
        setNotionError(response.error || 'Failed to disconnect');
        toast.error(response.error || 'Failed to disconnect from Notion');
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : 'Failed to disconnect from Notion';
      setNotionError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const pollSyncStatus = async () => {
    if (!pollIntervalRef.current) return;

    try {
      const serverStatus = await window.notionAPI.getServerStatus();

      if (!pollIntervalRef.current) return;

      if (serverStatus.syncStatus === 'completed') {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        completeSyncSuccess(serverStatus.totalDocuments || 0);
        setNotionSyncState({
          lastSyncAt: serverStatus.lastSyncAt || null,
          totalDocuments: serverStatus.totalDocuments || 0,
        });
        toast.success('Notion sync completed');
      } else if (serverStatus.syncStatus === 'failed') {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
        completeSyncError(serverStatus.syncError || 'Sync failed');
        toast.error(serverStatus.syncError || 'Sync failed');
      }
    } catch (error) {
      console.error('Failed to poll sync status:', error);
    }
  };

  const handleStartSync = async () => {
    try {
      startNotionSync();

      const response = await window.notionAPI.startSync(false);

      if (response.success) {
        toast.info('Syncing Notion pages...');
        pollIntervalRef.current = setInterval(pollSyncStatus, 5000);
      } else {
        completeSyncError(response.message);
        toast.error(response.message);
      }
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : 'Failed to start sync';
      completeSyncError(errorMessage);
      toast.error(errorMessage);
    }
  };

  const getOwnerEmail = (): string | null => {
    if (!notion.owner) return null;

    if (notion.owner.type === 'user' && notion.owner.user?.person?.email) {
      return notion.owner.user.person.email;
    }

    return null;
  };

  const formatLastSync = (dateStr: string | null): string => {
    if (!dateStr) return 'Never';
    const date = new Date(dateStr);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Integrations</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          Connect external services to enhance your browsing experience
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
              <NotionLogo className="h-5 w-5" />
            </div>
            <div className="flex-1">
              <CardTitle className="flex items-center gap-2">
                Notion
                {notion.isConnected && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
              </CardTitle>
              <CardDescription>
                Connect to your Notion workspace to save pages and notes
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent>
          <FieldGroup>
            {notion.isConnected && notion.workspace ? (
              <>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel>
                      <Plug2 className="h-4 w-4" />
                      Connected Workspace
                    </FieldLabel>
                    <FieldDescription>
                      <span className="text-foreground font-medium">
                        {notion.workspace.name}
                      </span>
                      {getOwnerEmail() && (
                        <span className="text-muted-foreground ml-2">
                          ({getOwnerEmail()})
                        </span>
                      )}
                    </FieldDescription>
                  </FieldContent>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleDisconnectNotion}
                    disabled={notion.isLoading || notionSync.isSyncing}
                  >
                    {notion.isLoading ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <XCircle className="mr-2 h-4 w-4" />
                    )}
                    Disconnect
                  </Button>
                </Field>

                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel>
                      <Database className="h-4 w-4" />
                      Indexed Documents
                    </FieldLabel>
                    <FieldDescription>
                      <span className="text-foreground font-medium">
                        {notionSync.totalDocuments} pages
                      </span>
                      <span className="text-muted-foreground ml-2 flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last sync: {formatLastSync(notionSync.lastSyncAt)}
                      </span>
                    </FieldDescription>
                  </FieldContent>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartSync}
                    disabled={notion.isLoading || notionSync.isSyncing}
                  >
                    {notionSync.isSyncing ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="mr-2 h-4 w-4" />
                    )}
                    {notionSync.isSyncing ? 'Syncing...' : 'Sync Now'}
                  </Button>
                </Field>

                {notionSync.syncError && (
                  <div className="text-destructive bg-destructive/10 rounded-md p-3 text-sm">
                    Sync error: {notionSync.syncError}
                  </div>
                )}
              </>
            ) : (
              <Field orientation="horizontal">
                <FieldContent>
                  <FieldLabel>
                    <Plug2 className="h-4 w-4" />
                    Connect your Notion account
                  </FieldLabel>
                  <FieldDescription>
                    Allow Browzer to access your Notion workspace to save and
                    organize content
                  </FieldDescription>
                </FieldContent>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleConnectNotion}
                  disabled={notion.isLoading}
                >
                  {notion.isLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ExternalLink className="mr-2 h-4 w-4" />
                  )}
                  Connect
                </Button>
              </Field>
            )}

            {notion.error && (
              <div className="text-destructive bg-destructive/10 rounded-md p-3 text-sm">
                {notion.error}
              </div>
            )}
          </FieldGroup>
        </CardContent>
      </Card>
    </div>
  );
}
