import { Bot } from 'lucide-react';

export default function AgentView() {
  return (
    <section className="flex flex-col h-full overflow-hidden items-center justify-center p-6">
      <div className="flex flex-col items-center text-center gap-4">
        <div className="p-4 rounded-full bg-blue-50 dark:bg-blue-950">
          <Bot className="w-12 h-12 text-blue-500" />
        </div>
        <h2 className="text-xl font-semibold">Agent Panel</h2>
        <p className="text-sm text-muted-foreground max-w-xs">
          The agent panel is coming soon. Stay tuned for AI-powered browsing
          assistance.
        </p>
      </div>
    </section>
  );
}
