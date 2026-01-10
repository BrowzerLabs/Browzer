import AgentView from './AgentView';

export function Sidebar() {
  return (
    <section className="h-full w-full flex flex-col overflow-hidden bg-background border-l border-l-foreground">
      <AgentView />
    </section>
  );
}
