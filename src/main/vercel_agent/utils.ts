import { createLogger, format, transports } from 'winston';

export const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json(),
    format.metadata()
  ),
  transports: [
    new transports.Console(),
    new transports.File({ filename: 'logs/orchestrator.log' })
  ]
});

export function validateApiKey(): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
}
