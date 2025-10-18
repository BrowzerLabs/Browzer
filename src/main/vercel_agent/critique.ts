import { z } from 'zod';
import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { validateApiKey, logger } from './utils';

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

validateApiKey();

const INPUT_SCHEMA = z.object({
  original_plan: z.string(),
  tool_response: z.string(),
  ss_analysis: z.string().optional(),
  message_history: z.array(z.object({ role: z.enum(['user','assistant']), content: z.string(), timestamp: z.string() })).optional()
});

const OUTPUT_SCHEMA = z.object({
  feedback: z.object({
    originalPlan: z.string(),
    currentProgress: z.string(),
    suggestions: z.array(z.string()),
    issues: z.array(z.string())
  }),
  terminate: z.boolean(),
  final_response: z.string()
});

export type CritiqueDecision = z.infer<typeof OUTPUT_SCHEMA>;

const SYSTEM_PROMPT = `
<agent_role>
You are a critique agent responsible for determining if the web automation plan has been completed based on the browser agent's execution. If complete, terminate with the final response. If not, provide feedback to revise the plan.
Take this job seriously!
</agent_role>

<rules>
<understanding_input>
1. Original plan is the full step-by-step plan.
2. Tool response is the browser agent's execution summary.
3. SS analysis is page context if available.
</understanding_input>

<evaluation>
1. Check if all steps in the plan were executed successfully based on tool response.
2. Verify if the task goal is achieved.
3. If complete, set terminate to true and provide final response.
4. If incomplete, set terminate to false and provide feedback with suggestions to revise the plan.
</evaluation>

<output_generation>
1. If terminating, final_response should be the actual answer to the query.
2. Avoid generic phrases; provide precise information.
3. Use tool response for the answer.
</output_generation>

<io_schema>
    <input>{"original_plan": "string", "tool_response": "string", "ss_analysis": "string"}</input>
    <output>{"feedback": {"originalPlan": "string", "currentProgress": "string", "suggestions": ["string"], "issues": ["string"]}, "terminate": "boolean", "final_response": "string"}</output>
</io_schema>

<final_response_guidelines>
  <rule>Extract specific information from tool_response or ss_analysis.</rule>
  <rule>If not complete, feedback explains issues and suggestions.</rule>
</final_response_guidelines>
`;

export async function critiqueStep(input: z.infer<typeof INPUT_SCHEMA>): Promise<CritiqueDecision> {
  const safe = INPUT_SCHEMA.parse({
    ...input,
    message_history: input.message_history?.map(m => ({ ...m, timestamp: typeof m.timestamp === 'string' ? m.timestamp : new Date(m.timestamp as any).toISOString() }))
  });

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-5-20250929'),
    system: SYSTEM_PROMPT,
    schema: OUTPUT_SCHEMA,
    prompt: JSON.stringify(safe)
  });

  return object;
}