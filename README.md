# Agentic Browser

A web browser built with Electron that supports Chrome extensions and integrates Python-based agents for enhanced browsing capabilities.

## Features

- Standard web browsing with navigation controls
- Chrome extension support (unpacked/packed extensions and Chrome Web Store)
- Split-view UI with web content and agent results
- Resizable panels with draggable divider
- Two Python-based agents:
  - **Crypto Summary Agent**: Displays cryptocurrency market data
  - **Topic Summarizer Agent**: Searches and summarizes web content based on queries

## Installation

### Prerequisites

- Node.js (v14+)
- npm (v6+)
- Python 3.7+
- Git

### Setup

1. Clone the repository:
   ```
   git clone <repository-url>
   cd Browser
   ```

2. Install Node.js dependencies:
   ```
   npm install
   ```

3. Set up Python agents:
   ```
   cd agents
   chmod +x setup.sh
   ./setup.sh
   cd ..
   ```

## Running the Browser

Start the browser with:

```
npm start
```

## Using the Browser

### Basic Navigation

- Use the URL bar to enter websites or search queries
- Use navigation buttons (back, forward, reload) for standard browsing

### Using Agents

1. Enter a query in the URL bar (e.g., "Bitcoin price" or "climate change")
2. Select the agent type from the dropdown in the right panel:
   - **Crypto Summary**: Shows cryptocurrency market data
   - **Topic Summarizer**: Searches and summarizes web content related to your query
3. Click "Run Agent" to execute the selected agent
4. View results in the right panel

### Managing Extensions

1. Click the "Extensions" button in the toolbar
2. Use the extensions panel to:
   - Load unpacked extensions (developer mode)
   - Load packed extensions (.crx files)
   - Browse and install from Chrome Web Store
   - View and manage installed extensions

## Troubleshooting

If agents fail to run:

1. Check that the Python environment is set up correctly:
   ```
   cd agents
   ./setup.sh
   ```

2. Make sure the required dependencies are installed:
   ```
   cd agents
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. Check agent log files in the `agents` directory:
   - `topic_agent.log`
   - `crypto_agent.log`

4. Check the main application logs:
   - `agent-execution.log`
   - `agent_debug.log`
   - `renderer_agent.log`

## License

[MIT License](LICENSE) 