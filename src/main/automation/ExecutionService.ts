import { TabService } from '../browser';

import { ContextService } from './ContextService';
import { SnapshotService } from './SnapshotService';
import { ClickService } from './ClickService';
import { TypeService } from './TypeService';
import { NavigateService } from './NavigateService';
import { KeyService } from './KeyService';
import { NotifyService } from './NotifyService';
import { FileUploadService } from './FileUploadService';
import { ScrollService } from './ScrollService';
import { AccessibilityTreeExtractor } from './AccessibilityTreeExtractor';

import type { ToolExecutionResult } from '@/shared/types';

export class ExecutionService {
  private contextService: ContextService;
  private snapshotService: SnapshotService;
  private clickService: ClickService;
  private typeService: TypeService;
  private navigateService: NavigateService;
  private keyService: KeyService;
  private notifyService: NotifyService;
  private fileUploadService: FileUploadService;
  private scrollService: ScrollService;
  private accessibilityTreeExtractor: AccessibilityTreeExtractor;

  constructor(private tabService: TabService) {
    this.clickService = new ClickService(this.tabService);
    this.typeService = new TypeService(this.tabService);
    this.navigateService = new NavigateService(this.tabService);
    this.keyService = new KeyService(this.tabService);
    this.notifyService = new NotifyService();
    this.fileUploadService = new FileUploadService(this.tabService);
    this.snapshotService = new SnapshotService(this.tabService);
    this.contextService = new ContextService(this.tabService);
    this.scrollService = new ScrollService(this.tabService);
    this.accessibilityTreeExtractor = new AccessibilityTreeExtractor(
      this.tabService
    );
  }

  public async executeTool(
    toolName: string,
    params: any
  ): Promise<ToolExecutionResult> {
    switch (toolName) {
      case 'wait':
        await this.sleep(params.duration);
        return { success: true };

      case 'navigate':
        return this.navigateService.execute(params);

      case 'click':
        return this.clickService.execute(params);

      case 'type':
        return this.typeService.execute(params);

      case 'key':
        return this.keyService.execute(params);

      case 'context':
        return this.contextService.execute(params);

      case 'snapshot':
        return this.snapshotService.execute(params);

      case 'notify':
        return this.notifyService.execute(params);

      case 'file':
        return this.fileUploadService.execute(params);

      case 'create_tab':
        await this.tabService.createTab(params.url, params.tabId);
        return { success: true };

      case 'scroll':
        return this.scrollService.execute(params);

      case 'waitForNetworkIdle':
        return this.navigateService.executeNetworkIdle(params);

      case 'extract_context':
        return this.accessibilityTreeExtractor.execute(params);

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
