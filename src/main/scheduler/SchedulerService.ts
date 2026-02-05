import { EventEmitter } from 'events';
import { WebContentsView } from 'electron';
import { randomUUID } from 'crypto';

import Store from 'electron-store';
import * as schedule from 'node-schedule';
import log from 'electron-log';

import {
  ScheduledAutomation,
  ScheduledAutomationStatus,
  CreateScheduledAutomationInput,
  ScheduledAutomationRunLog,
  AutomationStatus,
} from '@/shared/types';
import { AutomationService } from '@/main/llm';

interface SchedulerStoreSchema {
  scheduledAutomations: ScheduledAutomation[];
  runLogs: ScheduledAutomationRunLog[];
}

export class SchedulerService extends EventEmitter {
  private store: Store<SchedulerStoreSchema>;
  private jobs: Map<string, schedule.Job> = new Map();
  private sessionToScheduleMap: Map<string, string> = new Map();
  private runLogMap: Map<string, ScheduledAutomationRunLog> = new Map();

  constructor(
    private browserView: WebContentsView,
    private automationService: AutomationService
  ) {
    super();
    this.store = new Store<SchedulerStoreSchema>({
      name: 'scheduled-automations',
      defaults: {
        scheduledAutomations: [],
        runLogs: [],
      },
    });

    this.setupEventListeners();
    this.restoreSchedules();
  }

  private setupEventListeners(): void {
    this.automationService.on(
      'automation:session-complete',
      (data: {
        sessionId: string;
        success: boolean;
        finalOutput?: string;
        error?: string;
        totalStepsExecuted: number;
      }) => {
        this.handleSessionComplete(data);
      }
    );

    this.automationService.on(
      'automation:session-error',
      (data: { sessionId: string; error: string; finalOutput?: string }) => {
        this.handleSessionError(data);
      }
    );
  }

  private handleSessionComplete(data: {
    sessionId: string;
    success: boolean;
    finalOutput?: string;
    error?: string;
  }): void {
    const scheduledId = this.sessionToScheduleMap.get(data.sessionId);
    if (!scheduledId) return;

    const automation = this.getById(scheduledId);
    if (!automation) return;

    log.info(
      `[SchedulerService] Session ${data.sessionId} completed for scheduled automation ${scheduledId}`
    );

    const runLog = this.runLogMap.get(data.sessionId);
    if (runLog) {
      runLog.completedAt = Date.now();
      runLog.status = data.success
        ? AutomationStatus.COMPLETED
        : AutomationStatus.FAILED;
      runLog.output = data.finalOutput;
      if (!data.success) {
        runLog.error = data.error || 'Automation failed';
      }
      this.saveRunLog(runLog);
    }

    const newStatus =
      automation.frequency === 'one-time'
        ? ScheduledAutomationStatus.COMPLETED
        : ScheduledAutomationStatus.ACTIVE;

    const updatedAutomation = this.getById(scheduledId);
    const nextRunAt = updatedAutomation
      ? this.computeNextRunAt(updatedAutomation)
      : undefined;

    this.updateAutomationField(scheduledId, {
      status: newStatus,
      lastRunStatus: data.success
        ? AutomationStatus.COMPLETED
        : AutomationStatus.FAILED,
      lastRunOutput: data.finalOutput,
      lastRunError: data.success
        ? undefined
        : data.error || 'Automation failed',
      runCount: (automation.runCount || 0) + 1,
      nextRunAt,
    });

    this.cleanupSession(data.sessionId);
    this.notifyRenderer();
  }

  private handleSessionError(data: {
    sessionId: string;
    error: string;
    finalOutput?: string;
  }): void {
    const scheduledId = this.sessionToScheduleMap.get(data.sessionId);
    if (!scheduledId) return;

    const automation = this.getById(scheduledId);
    if (!automation) return;

    log.error(
      `[SchedulerService] Session ${data.sessionId} failed for scheduled automation ${scheduledId}: ${data.error}`
    );

    const runLog = this.runLogMap.get(data.sessionId);
    if (runLog) {
      runLog.completedAt = Date.now();
      runLog.status = AutomationStatus.FAILED;
      runLog.error = data.error;
      runLog.output = data.finalOutput;
      this.saveRunLog(runLog);
    }

    this.updateAutomationField(scheduledId, {
      status:
        automation.frequency === 'one-time'
          ? ScheduledAutomationStatus.FAILED
          : ScheduledAutomationStatus.ACTIVE,
      lastRunStatus: AutomationStatus.FAILED,
      lastRunError: data.error,
      lastRunOutput: data.finalOutput,
      runCount: (automation.runCount || 0) + 1,
    });

    this.cleanupSession(data.sessionId);
    this.notifyRenderer();
  }

  private cleanupSession(sessionId: string): void {
    this.sessionToScheduleMap.delete(sessionId);
    this.runLogMap.delete(sessionId);
  }

  private saveRunLog(runLog: ScheduledAutomationRunLog): void {
    const logs = this.store.get('runLogs');
    const existingIndex = logs.findIndex((l) => l.id === runLog.id);
    if (existingIndex !== -1) {
      logs[existingIndex] = runLog;
    } else {
      logs.push(runLog);
    }

    const filtered = logs
      .filter((l) => l.scheduledAutomationId === runLog.scheduledAutomationId)
      .sort((a, b) => b.startedAt - a.startedAt);
    if (filtered.length > 100) {
      const idsToRemove = new Set(filtered.slice(100).map((l) => l.id));
      const allLogs = logs.filter((l) => !idsToRemove.has(l.id));
      this.store.set('runLogs', allLogs);
    } else {
      this.store.set('runLogs', logs);
    }
  }

  public createScheduledAutomation(
    input: CreateScheduledAutomationInput
  ): ScheduledAutomation {
    const now = Date.now();
    const id = randomUUID();

    const automation: ScheduledAutomation = {
      id,
      name: input.name,
      userGoal: input.userGoal,
      recordingId: input.recordingId,
      frequency: input.frequency,
      scheduledTime: input.scheduledTime,
      dayOfWeek: input.dayOfWeek,
      dayOfMonth: input.dayOfMonth,
      hour: input.hour,
      minute: input.minute,
      status: ScheduledAutomationStatus.ACTIVE,
      createdAt: now,
      updatedAt: now,
      runCount: 0,
    };

    automation.nextRunAt = this.computeNextRunAt(automation);

    const automations = this.store.get('scheduledAutomations');
    automations.push(automation);
    this.store.set('scheduledAutomations', automations);

    this.scheduleJob(automation);
    this.notifyRenderer();

    log.info(
      `[SchedulerService] Created scheduled automation: ${id} (${input.frequency})`
    );

    return automation;
  }

  public getAll(): ScheduledAutomation[] {
    return this.store.get('scheduledAutomations');
  }

  public getById(id: string): ScheduledAutomation | undefined {
    return this.getAll().find((a) => a.id === id);
  }

  public updateScheduledAutomation(
    id: string,
    updates: Partial<CreateScheduledAutomationInput>
  ): ScheduledAutomation | null {
    const automations = this.store.get('scheduledAutomations');
    const index = automations.findIndex((a) => a.id === id);
    if (index === -1) return null;

    const existing = automations[index];
    const updated: ScheduledAutomation = {
      ...existing,
      ...updates,
      updatedAt: Date.now(),
    };
    updated.nextRunAt = this.computeNextRunAt(updated);

    automations[index] = updated;
    this.store.set('scheduledAutomations', automations);

    // Reschedule
    this.cancelJob(id);
    if (updated.status === ScheduledAutomationStatus.ACTIVE) {
      this.scheduleJob(updated);
    }

    this.notifyRenderer();
    return updated;
  }

  public deleteScheduledAutomation(id: string): boolean {
    const automations = this.store.get('scheduledAutomations');
    const filtered = automations.filter((a) => a.id !== id);
    if (filtered.length === automations.length) return false;

    this.store.set('scheduledAutomations', filtered);
    this.cancelJob(id);

    // Clean up run logs
    const logs = this.store.get('runLogs');
    this.store.set(
      'runLogs',
      logs.filter((l) => l.scheduledAutomationId !== id)
    );

    this.notifyRenderer();
    log.info(`[SchedulerService] Deleted scheduled automation: ${id}`);
    return true;
  }

  public pauseScheduledAutomation(id: string): boolean {
    return this.setStatus(id, ScheduledAutomationStatus.PAUSED);
  }

  public resumeScheduledAutomation(id: string): boolean {
    const automations = this.store.get('scheduledAutomations');
    const index = automations.findIndex((a) => a.id === id);
    if (index === -1) return false;

    automations[index].status = ScheduledAutomationStatus.ACTIVE;
    automations[index].updatedAt = Date.now();
    automations[index].nextRunAt = this.computeNextRunAt(automations[index]);
    this.store.set('scheduledAutomations', automations);

    this.scheduleJob(automations[index]);
    this.notifyRenderer();
    return true;
  }

  public getRunLogs(
    scheduledAutomationId: string
  ): ScheduledAutomationRunLog[] {
    return this.store
      .get('runLogs')
      .filter((l) => l.scheduledAutomationId === scheduledAutomationId)
      .sort((a, b) => b.startedAt - a.startedAt);
  }

  public destroy(): void {
    for (const [id, job] of this.jobs) {
      job.cancel();
      log.info(`[SchedulerService] Cancelled job: ${id}`);
    }
    this.jobs.clear();
    this.sessionToScheduleMap.clear();
    this.runLogMap.clear();
    this.automationService.removeAllListeners('automation:session-complete');
    this.automationService.removeAllListeners('automation:session-error');
  }

  private scheduleJob(automation: ScheduledAutomation): void {
    if (automation.status !== ScheduledAutomationStatus.ACTIVE) return;

    const rule = this.buildScheduleRule(automation);
    if (!rule) {
      log.warn(
        `[SchedulerService] Could not build schedule rule for: ${automation.id}`
      );
      return;
    }

    const job = schedule.scheduleJob(rule, () => {
      this.executeScheduledAutomation(automation.id);
    });

    if (job) {
      this.jobs.set(automation.id, job);
      log.info(
        `[SchedulerService] Scheduled job: ${automation.id}, next: ${job.nextInvocation()?.toISOString()}`
      );
    } else {
      log.warn(
        `[SchedulerService] Failed to schedule job (may be in the past): ${automation.id}`
      );
      // For one-time schedules in the past, mark as completed
      if (automation.frequency === 'one-time') {
        this.setStatus(automation.id, ScheduledAutomationStatus.COMPLETED);
      }
    }
  }

  private buildScheduleRule(
    automation: ScheduledAutomation
  ): schedule.RecurrenceRule | Date | null {
    const { frequency, hour, minute, dayOfWeek, dayOfMonth, scheduledTime } =
      automation;

    switch (frequency) {
      case 'one-time': {
        const date = new Date(scheduledTime);
        date.setHours(hour, minute, 0, 0);
        if (date.getTime() <= Date.now()) return null;
        return date;
      }

      case 'hourly': {
        const rule = new schedule.RecurrenceRule();
        rule.minute = minute;
        return rule;
      }

      case 'daily': {
        const rule = new schedule.RecurrenceRule();
        rule.hour = hour;
        rule.minute = minute;
        return rule;
      }

      case 'weekly': {
        const rule = new schedule.RecurrenceRule();
        rule.dayOfWeek = dayOfWeek ?? 0;
        rule.hour = hour;
        rule.minute = minute;
        return rule;
      }

      case 'monthly': {
        const rule = new schedule.RecurrenceRule();
        rule.date = dayOfMonth ?? 1;
        rule.hour = hour;
        rule.minute = minute;
        return rule;
      }

      default:
        return null;
    }
  }

  private async executeScheduledAutomation(id: string): Promise<void> {
    const automation = this.getById(id);
    if (!automation) return;
    if (
      automation.status !== ScheduledAutomationStatus.ACTIVE &&
      automation.status !== ScheduledAutomationStatus.RUNNING
    ) {
      return;
    }

    log.info(`[SchedulerService] Executing scheduled automation: ${id}`);

    this.updateAutomationField(id, {
      status: ScheduledAutomationStatus.RUNNING,
      lastRunAt: Date.now(),
    });
    this.notifyRenderer();

    try {
      const result = await this.automationService.execute(
        automation.userGoal,
        automation.recordingId
      );

      if (result.success) {
        this.sessionToScheduleMap.set(result.sessionId, id);
        const runLog: ScheduledAutomationRunLog = {
          id: randomUUID(),
          scheduledAutomationId: id,
          startedAt: Date.now(),
          status: AutomationStatus.RUNNING,
        };
        this.runLogMap.set(result.sessionId, runLog);

        log.info(
          `[SchedulerService] Automation session ${result.sessionId} started for scheduled automation ${id}`
        );
      } else {
        const runLog: ScheduledAutomationRunLog = {
          id: randomUUID(),
          scheduledAutomationId: id,
          startedAt: Date.now(),
          completedAt: Date.now(),
          status: AutomationStatus.FAILED,
          error: result.message || 'Failed to start automation',
        };
        this.saveRunLog(runLog);

        this.updateAutomationField(id, {
          status:
            automation.frequency === 'one-time'
              ? ScheduledAutomationStatus.FAILED
              : ScheduledAutomationStatus.ACTIVE,
          lastRunStatus: AutomationStatus.FAILED,
          lastRunError: result.message || 'Failed to start automation',
          runCount: (automation.runCount || 0) + 1,
        });

        this.notifyRenderer();
      }
    } catch (error) {
      log.error(
        `[SchedulerService] Failed to start scheduled automation ${id}:`,
        error
      );

      const runLog: ScheduledAutomationRunLog = {
        id: randomUUID(),
        scheduledAutomationId: id,
        startedAt: Date.now(),
        completedAt: Date.now(),
        status: AutomationStatus.FAILED,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      this.saveRunLog(runLog);

      this.updateAutomationField(id, {
        status:
          automation.frequency === 'one-time'
            ? ScheduledAutomationStatus.FAILED
            : ScheduledAutomationStatus.ACTIVE,
        lastRunStatus: AutomationStatus.FAILED,
        lastRunError: error instanceof Error ? error.message : 'Unknown error',
        runCount: (automation.runCount || 0) + 1,
      });

      this.notifyRenderer();
    }
  }

  private updateAutomationField(
    id: string,
    fields: Partial<ScheduledAutomation>
  ): void {
    const automations = this.store.get('scheduledAutomations');
    const index = automations.findIndex((a) => a.id === id);
    if (index === -1) return;

    automations[index] = {
      ...automations[index],
      ...fields,
      updatedAt: Date.now(),
    };
    this.store.set('scheduledAutomations', automations);
  }

  private setStatus(id: string, status: ScheduledAutomationStatus): boolean {
    const automations = this.store.get('scheduledAutomations');
    const index = automations.findIndex((a) => a.id === id);
    if (index === -1) return false;

    automations[index].status = status;
    automations[index].updatedAt = Date.now();
    this.store.set('scheduledAutomations', automations);

    if (status === ScheduledAutomationStatus.PAUSED) {
      this.cancelJob(id);
    }

    this.notifyRenderer();
    return true;
  }

  private cancelJob(id: string): void {
    const job = this.jobs.get(id);
    if (job) {
      job.cancel();
      this.jobs.delete(id);
    }
  }

  private restoreSchedules(): void {
    const automations = this.getAll();
    let restored = 0;

    for (const automation of automations) {
      if (automation.status === ScheduledAutomationStatus.RUNNING) {
        // Reset stuck running automations back to active
        this.updateAutomationField(automation.id, {
          status: ScheduledAutomationStatus.ACTIVE,
        });
        automation.status = ScheduledAutomationStatus.ACTIVE;
      }

      if (automation.status === ScheduledAutomationStatus.ACTIVE) {
        // For one-time schedules, check if they're in the past
        if (automation.frequency === 'one-time') {
          const scheduledDate = new Date(automation.scheduledTime);
          scheduledDate.setHours(automation.hour, automation.minute, 0, 0);
          if (scheduledDate.getTime() <= Date.now()) {
            this.updateAutomationField(automation.id, {
              status: ScheduledAutomationStatus.COMPLETED,
            });
            continue;
          }
        }

        this.scheduleJob(automation);
        restored++;
      }
    }

    log.info(`[SchedulerService] Restored ${restored} scheduled automations`);
  }

  private computeNextRunAt(
    automation: ScheduledAutomation
  ): string | undefined {
    const rule = this.buildScheduleRule(automation);
    if (!rule) return undefined;

    if (rule instanceof Date) {
      return rule.toISOString();
    }

    // For recurrence rules, compute next invocation
    const job = schedule.scheduleJob(rule, () => {
      /* noop for next invocation calc */
    });
    if (job) {
      const next = job.nextInvocation();
      job.cancel();
      return next ? next.toISOString() : undefined;
    }

    return undefined;
  }

  private notifyRenderer(): void {
    if (this.browserView.webContents.isDestroyed()) return;
    this.browserView.webContents.send('scheduler:updated', this.getAll());
  }
}
