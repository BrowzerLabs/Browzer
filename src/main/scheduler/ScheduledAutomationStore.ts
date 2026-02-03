import { randomUUID } from 'crypto';

import Store from 'electron-store';

import {
  ScheduledAutomation,
  ScheduledAutomationRun,
  ScheduledAutomationStatus,
  CreateScheduledAutomationParams,
  UpdateScheduledAutomationParams,
} from '@/shared/types';

interface ScheduledAutomationStoreSchema {
  scheduledAutomations: Record<string, ScheduledAutomation>;
  runs: Record<string, ScheduledAutomationRun>;
}

export class ScheduledAutomationStore {
  private store: Store<ScheduledAutomationStoreSchema>;

  constructor() {
    this.store = new Store<ScheduledAutomationStoreSchema>({
      name: 'scheduled-automations',
      defaults: {
        scheduledAutomations: {},
        runs: {},
      },
    });
  }

  public createScheduledAutomation(
    params: CreateScheduledAutomationParams
  ): ScheduledAutomation {
    const id = randomUUID();
    const now = Date.now();

    const scheduledAutomation: ScheduledAutomation = {
      id,
      name: params.name,
      userGoal: params.userGoal,
      recordingId: params.recordingId,
      type: params.type,
      status: ScheduledAutomationStatus.PENDING,
      createdAt: now,
      updatedAt: now,
      nextRunAt: now,
      runCount: 0,
      successCount: 0,
      failureCount: 0,
      enabled: true,
    };

    const automations = this.store.get('scheduledAutomations');
    automations[id] = scheduledAutomation;
    this.store.set('scheduledAutomations', automations);

    return scheduledAutomation;
  }

  public updateScheduledAutomation(
    params: UpdateScheduledAutomationParams
  ): ScheduledAutomation | null {
    const automations = this.store.get('scheduledAutomations');
    const existing = automations[params.id];

    if (!existing) {
      return null;
    }

    const updated: ScheduledAutomation = {
      ...existing,
      name: params.name ?? existing.name,
      userGoal: params.userGoal ?? existing.userGoal,
      recordingId: params.recordingId ?? existing.recordingId,
      type: params.type ?? existing.type,
      enabled: params.enabled ?? existing.enabled,
      updatedAt: Date.now(),
    };

    automations[params.id] = updated;
    this.store.set('scheduledAutomations', automations);

    return updated;
  }

  public deleteScheduledAutomation(id: string): boolean {
    const automations = this.store.get('scheduledAutomations');

    if (!automations[id]) {
      return false;
    }

    delete automations[id];
    this.store.set('scheduledAutomations', automations);

    const runs = this.store.get('runs');
    Object.keys(runs).forEach((runId) => {
      if (runs[runId].scheduledAutomationId === id) {
        delete runs[runId];
      }
    });
    this.store.set('runs', runs);

    return true;
  }

  public getScheduledAutomation(id: string): ScheduledAutomation | null {
    const automations = this.store.get('scheduledAutomations');
    return automations[id] || null;
  }

  public getAllScheduledAutomations(): ScheduledAutomation[] {
    const automations = this.store.get('scheduledAutomations');
    return Object.values(automations);
  }

  public getEnabledScheduledAutomations(): ScheduledAutomation[] {
    return this.getAllScheduledAutomations().filter((a) => a.enabled);
  }

  public updateNextRunTime(id: string, nextRunAt: number): void {
    const automations = this.store.get('scheduledAutomations');
    const automation = automations[id];

    if (automation) {
      automation.nextRunAt = nextRunAt;
      automation.updatedAt = Date.now();
      this.store.set('scheduledAutomations', automations);
    }
  }

  public updateStatus(id: string, status: ScheduledAutomationStatus): void {
    const automations = this.store.get('scheduledAutomations');
    const automation = automations[id];

    if (automation) {
      automation.status = status;
      automation.updatedAt = Date.now();
      this.store.set('scheduledAutomations', automations);
    }
  }

  public incrementRunCount(id: string, success: boolean): void {
    const automations = this.store.get('scheduledAutomations');
    const automation = automations[id];

    if (automation) {
      automation.runCount++;
      automation.lastRunAt = Date.now();
      automation.updatedAt = Date.now();
      this.store.set('scheduledAutomations', automations);
    }
  }

  public createRun(
    scheduledAutomationId: string,
    sessionId: string
  ): ScheduledAutomationRun {
    const id = randomUUID();
    const run: ScheduledAutomationRun = {
      id,
      scheduledAutomationId,
      startTime: Date.now(),
      status: ScheduledAutomationStatus.RUNNING,
    };

    const runs = this.store.get('runs');
    runs[id] = run;
    this.store.set('runs', runs);

    return run;
  }

  public updateRun(
    id: string,
    status: ScheduledAutomationStatus,
    result?: any,
    error?: string
  ): void {
    const runs = this.store.get('runs');
    const run = runs[id];

    if (run) {
      run.status = status;
      run.endTime = Date.now();
      run.result = result;
      run.error = error;
      this.store.set('runs', runs);
    }
  }

  public getRunsByScheduledAutomation(
    scheduledAutomationId: string
  ): ScheduledAutomationRun[] {
    const runs = this.store.get('runs');
    return Object.values(runs)
      .filter((run) => run.scheduledAutomationId === scheduledAutomationId)
      .sort((a, b) => b.startTime - a.startTime);
  }

  public getRecentRuns(limit = 50): ScheduledAutomationRun[] {
    const runs = this.store.get('runs');
    return Object.values(runs)
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, limit);
  }

  public clearOldRuns(daysToKeep = 30): void {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;
    const runs = this.store.get('runs');

    Object.keys(runs).forEach((runId) => {
      if (runs[runId].startTime < cutoffTime) {
        delete runs[runId];
      }
    });

    this.store.set('runs', runs);
  }
}
