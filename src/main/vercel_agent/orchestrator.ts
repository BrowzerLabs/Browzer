import { z } from 'zod';
import { planTask, type PlannerOutput } from './planner';
import { executeStep } from './browser';
import { critiqueStep } from './critique';
import { buildTools } from './tools';
import { CDPConnection } from './tools/cdp';
import { validateApiKey, logger } from './utils';
import { EventEmitter } from 'events';

export class VercelOrchestrator extends EventEmitter {
  private iteration = 0;
  private textCache: string | null = null;

  constructor(private cdp: CDPConnection, private getPageContext: () => Promise<string>) {
    super();
  }

  private async testApiConnection(): Promise<void> {
    const { generateText } = await import('ai');
    const { createAnthropic } = await import('@ai-sdk/anthropic');

    const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

    await Promise.race([
      generateText({
        model: anthropic('claude-sonnet-4-5-20250929'),
        prompt: 'Say "API test successful"',
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('API test timeout after 10 seconds')), 10000)
      ),
    ]);
  }

  private async getFallbackText(): Promise<string> {
    try {
      const pageText = await this.cdp.sendCommand('Runtime.evaluate', {
        expression: `document.body.textContent || ''`,
      });
      return pageText.result?.value || 'No text content available';
    } catch {
      return 'Unable to extract fallback text';
    }
  }

  private async getPageText(): Promise<string> {
    if (this.textCache) return this.textCache;
    const pageText = await this.cdp.sendCommand('Runtime.evaluate', {
      expression: `document.body.textContent.slice(0, 2000) || ''`,
    });
    this.textCache = pageText.result?.value || '';
    return this.textCache;
  }

  private async withRetry<T>(fn: () => Promise<T>, retries: number = 3, delayMs: number = 1000): Promise<T> {
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await Promise.race([
          fn(),
          new Promise<T>((_, reject) => setTimeout(() => reject(new Error(`Timeout after ${delayMs}ms`)), delayMs)),
        ]);
      } catch (error) {
        if (attempt === retries) throw error;
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt)));
      }
    }
    throw new Error('Retry limit reached');
  }

  async run(query: string): Promise<string> {
    validateApiKey();
    const isDebug = process.env.DEBUG_MODE === 'true';
    this.emit('taskStarted', { query });
    logger.info('Starting execution', { query, iteration: this.iteration });

    try {
      logger.info('Testing API connection');
      await this.testApiConnection();
      logger.info('API connection test passed');
    } catch (error) {
      logger.error('API connection test failed', { error: error.message });
      return `API connection failed: ${error.message}`;
    }

    let terminate = false;
    let finalResponse = '';
    let currentPlan = '';

    const tools = buildTools(this.cdp);

    while (!terminate && this.iteration < 5) {
      this.iteration++;

      logger.info('Planner Agent processing', { iteration: this.iteration, query: query.substring(0, 100) });

      const plannerOut: PlannerOutput = await this.withRetry(async () => {
        logger.info('Calling planTask');
        const result = await planTask({ query });
        logger.info('planTask completed successfully');
        return result;
      }, 3, 20000);
      currentPlan = plannerOut.plan;
      logger.info('Plan generated', { plan: plannerOut.plan.substring(0, 100) });

      logger.info('Browser Agent executing plan');
      const action = await this.withRetry(async () => {
        const result = await executeStep({ plan: plannerOut.plan }, tools);
        logger.info('executeStep completed', { result: result.substring(0, 100) });
        return result;
      }, 3, 30000);

      const pageCtx = await this.getPageContext();

      logger.info('Critique Agent analyzing');
      const critique = await this.withRetry(async () => {
        const critiqueResult = await critiqueStep({
          original_plan: plannerOut.plan,
          tool_response: action,
          ss_analysis: pageCtx,
        });
        logger.info('critiqueStep completed', { terminate: critiqueResult.terminate });
        return critiqueResult;
      }, 3, 20000);

      if (critique.terminate) {
        terminate = true;
        finalResponse = critique.final_response;
      } else {
        // Update query with critique feedback to revise plan
        query = `${query}\nFeedback: ${JSON.stringify(critique.feedback)}`;
      }
    }

    if (!finalResponse) {
      finalResponse = 'No final response produced after max iterations.';
    }

    this.emit('taskCompleted', { query, result: finalResponse });
    if (isDebug && terminate) {
      const screenshot = await this.cdp.sendCommand('Page.captureScreenshot');
      logger.debug('Final screenshot', { pngBase64: screenshot.data });
    }

    return finalResponse;
  }
}