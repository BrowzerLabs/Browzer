import { EventEmitter } from 'events';

import { ScheduledAutomationStore } from './ScheduledAutomationStore';

import {
  ScheduledAutomation,
  ScheduleType,
  ScheduledAutomationStatus,
  CreateScheduledAutomationParams,
  UpdateScheduledAutomationParams,
} from '@/shared/types';

export class SchedulerService extends EventEmitter {
  private store: ScheduledAutomationStore;
  private checkInterval: NodeJS.Timeout | null = null;
  private readonly CHECK_INTERVAL_MS = 30000;
  private runningAutomations = new Set<string>();

  constructor() {
    super();
    this.store = new ScheduledAutomationStore();
  }

  public start(): void {
    if (this.checkInterval) {
      return;
    }

    console.log('[SchedulerService] Starting scheduler...');
    this.checkAndRunDueAutomations();

    this.checkInterval = setInterval(() => {
      this.checkAndRunDueAutomations();
    }, this.CHECK_INTERVAL_MS);

    this.store.clearOldRuns(30);
  }

  public stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
      console.log('[SchedulerService] Scheduler stopped');
    }
  }

  private async checkAndRunDueAutomations(): Promise<void> {
    const now = Date.now();
    const enabledAutomations = this.store.getEnabledScheduledAutomations();

    for (const automation of enabledAutomations) {
      if (
        automation.nextRunAt &&
        automation.nextRunAt <= now &&
        !this.runningAutomations.has(automation.id)
      ) {
        console.log(
          `[SchedulerService] Triggering scheduled automation: ${automation.name} (${automation.id})`
        );
        this.triggerAutomation(automation);
      }
    }
  }

  private triggerAutomation(automation: ScheduledAutomation): void {
    this.runningAutomations.add(automation.id);
    this.store.updateStatus(automation.id, ScheduledAutomationStatus.RUNNING);

    this.emit('automation:trigger', {
      automationId: automation.id,
      userGoal: automation.userGoal,
      recordingId: automation.recordingId,
    });
  }

  public onAutomationComplete(
    automationId: string,
    sessionId: string,
    success: boolean,
    result?: any,
    error?: string
  ): void {
    this.runningAutomations.delete(automationId);

    const automation = this.store.getScheduledAutomation(automationId);
    if (!automation) {
      return;
    }

    this.store.incrementRunCount(automationId, success);

    const run = this.store.createRun(automationId, sessionId);
    this.store.updateRun(
      run.id,
      success
        ? ScheduledAutomationStatus.COMPLETED
        : ScheduledAutomationStatus.FAILED,
      result,
      error
    );

    if (automation.type === 'one_time') {
      this.store.updateStatus(
        automationId,
        success
          ? ScheduledAutomationStatus.COMPLETED
          : ScheduledAutomationStatus.FAILED
      );
      console.log(
        `[SchedulerService] One-time automation completed: ${automation.name}`
      );
    } else {
      const nextRunAt = this.calculateNextRunTime(
        automation.type,
        automation.endTime
      );
      if (nextRunAt) {
        this.store.updateNextRunTime(automationId, nextRunAt);
        this.store.updateStatus(
          automationId,
          ScheduledAutomationStatus.PENDING
        );
        console.log(
          `[SchedulerService] Next run scheduled for: ${new Date(nextRunAt).toISOString()}`
        );
      } else {
        this.store.updateStatus(
          automationId,
          ScheduledAutomationStatus.COMPLETED
        );
        console.log(
          `[SchedulerService] Periodic automation ended: ${automation.name}`
        );
      }
    }

    this.emit('automation:complete', {
      automationId,
      sessionId,
      success,
      result,
      error,
    });
  }

  private calculateNextRunTime(
    type: ScheduleType,
    endTime?: number
  ): number | null {
    const now = Date.now();

    if (type === 'one_time' && endTime && now >= endTime) {
      return null;
    }

    let nextRun = now;

    switch (type) {
      case 'hourly':
        nextRun += 60 * 60 * 1000;
        break;

      case 'daily':
        nextRun += 24 * 60 * 60 * 1000;
        break;

      case 'weekly':
        nextRun += 7 * 24 * 60 * 60 * 1000;
        break;

      case 'monthly':
        const date = new Date(nextRun);
        date.setMonth(date.getMonth() + 1);
        nextRun = date.getTime();
        break;

      default:
        return null;
    }

    if (endTime && nextRun >= endTime) {
      return null;
    }

    return nextRun;
  }

  public createScheduledAutomation(
    params: CreateScheduledAutomationParams
  ): ScheduledAutomation {
    const automation = this.store.createScheduledAutomation(params);
    console.log(
      `[SchedulerService] Created scheduled automation: ${automation.name} (${automation.id})`
    );
    this.emit('automation:created', automation);
    return automation;
  }

  public updateScheduledAutomation(
    params: UpdateScheduledAutomationParams
  ): ScheduledAutomation | null {
    const automation = this.store.updateScheduledAutomation(params);
    if (automation) {
      console.log(
        `[SchedulerService] Updated scheduled automation: ${automation.name} (${automation.id})`
      );
      this.emit('automation:updated', automation);
    }
    return automation;
  }

  public deleteScheduledAutomation(id: string): boolean {
    const success = this.store.deleteScheduledAutomation(id);
    if (success) {
      this.runningAutomations.delete(id);
      console.log(`[SchedulerService] Deleted scheduled automation: ${id}`);
      this.emit('automation:deleted', id);
    }
    return success;
  }

  public getScheduledAutomation(id: string): ScheduledAutomation | null {
    return this.store.getScheduledAutomation(id);
  }

  public getAllScheduledAutomations(): ScheduledAutomation[] {
    return this.store.getAllScheduledAutomations();
  }

  public toggleAutomation(id: string, enabled: boolean): boolean {
    const result = this.store.updateScheduledAutomation({ id, enabled });
    if (result) {
      console.log(
        `[SchedulerService] Toggled automation ${id}: ${enabled ? 'enabled' : 'disabled'}`
      );
      this.emit('automation:toggled', { id, enabled });
    }
    return !!result;
  }

  public getRunHistory(scheduledAutomationId: string) {
    return this.store.getRunsByScheduledAutomation(scheduledAutomationId);
  }

  public getRecentRuns(limit = 50) {
    return this.store.getRecentRuns(limit);
  }

  public destroy(): void {
    this.stop();
    this.removeAllListeners();
  }
}
