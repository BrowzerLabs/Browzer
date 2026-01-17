import type { ToolExecutionResult } from '@/shared/types';
import { ContextService } from './ContextService';
import { SnapshotService } from './SnapshotService';
import { ClickService } from './ClickService';
import { TypeService } from './TypeService';
import { NavigateService } from './NavigateService';
import { KeyService } from './KeyService';
import { NotifyService } from './NotifyService';
import { ExecutionContext } from './BaseActionService';

export class ExecutionService {
  private contextService: ContextService;
  private snapshotService: SnapshotService;
  private clickService: ClickService;
  private typeService: TypeService;
  private navigateService: NavigateService;
  private keyService: KeyService;
  private notifyService: NotifyService;

  constructor(private context: ExecutionContext) {
    this.clickService = new ClickService(this.context);
    this.typeService = new TypeService(this.context);
    this.navigateService = new NavigateService(this.context);
    this.keyService = new KeyService(this.context);
    this.snapshotService = new SnapshotService(this.context);
    this.contextService = new ContextService(this.context);

    this.notifyService = new NotifyService();
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
        return this.contextService.execute();

      case 'snapshot':
        return this.snapshotService.execute(params);

      case 'notify':
        return this.notifyService.execute(params);

      default:
        return { success: false, error: `Unknown tool: ${toolName}` };
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
