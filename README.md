<div align="center">

# 🌐 Browzer

**An Intelligent Agentic Browser with Smart Workflow Recording & Automation**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Electron](https://img.shields.io/badge/Electron-38.2.1-47848F?logo=electron)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-19.2.0-61DAFB?logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.5.5-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.4.20-646CFF?logo=vite)](https://vitejs.dev/)
[![Python](https://img.shields.io/badge/Python-3.10.19-275379?logo=python)](https://www.python.org/)

[Features](#-features) • [Installation](#-installation) • [Usage](#-usage) • [Architecture](#-architecture) • [Documentation](#-documentation) • [Contributing](#-contributing)

</div>

---

## 📖 Overview

**Browzer** is a next-generation agentic browser built with Electron, Vite, React, and TypeScript. It combines the familiar browsing experience of Chrome with powerful AI-driven workflow automation capabilities. Record your browsing workflows semantically and replay them intelligently using LLM orchestration.

### 🎯 Core Philosophy

- **Smart Recording**: Capture not just clicks, but the semantic intent behind user actions
- **Intelligent Automation**: Replay workflows with AI-powered adaptability
- **Privacy-First**: All data stored locally with full user control
- **Modern UX**: Beautiful, intuitive interface built with shadcn/ui and Tailwind CSS

---

## ✨ Features

### 🌐 Full-Featured Browser
- **Multi-tab browsing** with Chrome-like interface
- **Navigation controls** (back, forward, reload, stop)
- **Address bar** with URL validation and search
- **Browsing history** with search and filtering
- **Internal pages** (`browzer://history`, `browzer://profile`, etc.)
- **Resizable sidebar** for agent UI
- **Dark mode** support

### 🎬 Smart Workflow Recording
- **Semantic action capture** - Records user intent, not just DOM events
- **Intelligent element tracking** - Uses multiple selectors for reliability
- **Network request monitoring** - Tracks API calls and responses
- **Form interaction recording** - Captures input, selection, and submission
- **Navigation tracking** - Records page transitions and redirects
- **Real-time action preview** - See actions as they're recorded

### 🤖 AI-Powered Automation *(In Development - Enhanced with VLM)*
- **LLM orchestration** for intelligent task replication
- **Visual understanding** - VLM analyzes screenshots for better automation
- **Smart action cleanup** - Automatically removes meaningless clicks and actions
- **Adaptive replay** - Handles UI changes and variations using visual context
- **Context-aware execution** - Understands workflow goals through semantic analysis
- **Error recovery** - Smart handling of failures with visual feedback

#### VLM Setup (Optional Enhancement)

To enable VLM features:

1. **Create Python environment**: `python3.10 -m venv venv && source venv/bin/activate`
2. **Clone Apple ML-FastVLM**: `git clone https://github.com/apple/ml-fastvlm.git`
3. **Install**: `pip install -e ml-fastvlm/`
4. **Create model directory**: `mkdir -p vlm-models/checkpoints`
5. **Download model**: `cd vlm-models/checkpoints && wget https://ml-site.cdn-apple.com/datasets/fastvlm/llava-fastvithd_1.5b_stage3.zip && unzip llava-fastvithd_1.5b_stage3.zip && rm llava-fastvithd_1.5b_stage3.zip`

Configure `.env.vlm`:
```env
VLM_ENABLED=true
VLM_MODEL_PATH=./vlm-models/checkpoints/llava-fastvithd_1.5b_stage3
VLM_ML_PATH=./vlm-models
VLM_TIMEOUT_MS=30000
VLM_MAX_NEW_TOKENS=128
VLM_TEMPERATURE=0.0
```

### 👤 User Management
- **Authentication system** with sign-in/sign-up
- **User profiles** with preferences
- **Guest mode** for quick access
- **Session management** with auto-refresh
- **Account management** (update profile, delete account)

### 📊 Browsing History
- **Automatic tracking** of all page visits
- **Search & filter** by title, URL, or date
- **Statistics dashboard** (daily/weekly visits, top sites)
- **Bulk management** (select multiple, delete, clear all)
- **Date grouping** (Today, Yesterday, specific dates)
- **Visit counts** and timestamps

### ⚙️ Settings & Customization
- **Appearance settings** (theme, font size)
- **Privacy controls** (history, cookies)
- **Recording preferences** (auto-save, quality)
- **Keyboard shortcuts**
- **Import/Export** settings

---

## 🚀 Installation

### Prerequisites

- **Node.js** 18+ ([Download](https://nodejs.org/))
- **pnpm** 10+ (recommended) or npm
- **Git** ([Download](https://git-scm.com/))

### Quick Start

```bash
# Clone the repository
git clone https://github.com/BrowzerLabs/Browzer.git
cd Browzer
git checkout cdp-revamp

# Install dependencies
pnpm install

# Start development server
pnpm start
```

### Build for Production

```bash
# Package the application
pnpm package

# Create distributable installers
pnpm make
```

### Supported Platforms

- ✅ **macOS** (Intel & Apple Silicon)
- ✅ **Windows** (x64)
- ✅ **Linux** (Debian, RPM)

---

## 🎮 Usage

### Basic Browsing

1. **Launch Browzer** - Start the application
2. **Enter URL** - Type in the address bar or search
3. **Navigate** - Use tabs, back/forward buttons
4. **View History** - Click `browzer://history`

### Recording Workflows

1. **Start Recording**
   ```
   Click the Record button in the toolbar
   ```

2. **Perform Actions**
   - Navigate to websites
   - Fill forms
   - Click buttons
   - Submit data

3. **Stop Recording**
   ```
   Click Stop button
   Save with a descriptive name
   ```

4. **View Recordings**
   ```
   Access from the sidebar
   Review captured actions
   ```

### Managing Recordings

```typescript
// Recordings are stored locally
~/Library/Application Support/browzer/recordings.json (macOS)
%APPDATA%/browzer/recordings.json (Windows)
~/.config/browzer/recordings.json (Linux)
```

---

## 🏗️ Architecture

### Tech Stack

```
┌─────────────────────────────────────────────────────────┐
│                     Frontend (Renderer)                 │
│  React 19 + TypeScript + Vite + Tailwind + shadcn/ui    │
│  - Modern UI components                                 │
│  - State management (Zustand)                           │
│  - Routing (React Router)                               │
└────────────────────┬────────────────────────────────────┘
                     │ IPC Communication
┌────────────────────┴────────────────────────────────────┐
│                  Backend (Main Process)                 │
│  Electron 38 + TypeScript + Node.js + Python            │
│  - BrowserManager (Tab management)                      │
│  - ActionRecorder (Workflow capture)                    │
│  - HistoryService (Browsing history)                    │
│  - UserService (Authentication)                         │
│  - SettingsStore (Configuration)                        │
│  - VLMService (VLM integration)                         │
└─────────────────────────────────────────────────────────┘
```

### Project Structure

```
browzer/
├── src/
│   ├── main/                    # Main process (Electron)
│   │   ├── BrowserManager.ts    # Tab & navigation management
│   │   ├── ActionRecorder.ts    # Workflow recording engine
│   │   ├── HistoryService.ts    # Browsing history
│   │   ├── UserService.ts       # Authentication & users
│   │   ├── SettingsStore.ts     # App settings
│   │   ├── RecordingStore.ts    # Recording persistence
│   │   ├── automation/          # Automation engine
│   │   ├── ipc/                 # IPC handlers
│   │   └── window/              # Window management
│   │
│   ├── renderer/                # Renderer process (React)
│   │   ├── components/          # React components
│   │   │   ├── AddressBar.tsx
│   │   │   ├── TabBar.tsx
│   │   │   ├── Sidebar.tsx
│   │   │   └── ...
│   │   ├── screens/             # Full-page screens
│   │   │   ├── History.tsx
│   │   │   ├── Profile.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── ...
│   │   ├── ui/                  # shadcn/ui components
│   │   └── lib/                 # Utilities
│   │
│   ├── shared/                  # Shared types & constants
│   │   └── types.ts
│   │
│   ├── preload.ts               # Preload script (Bridge)
│   └── index.ts                 # Main entry point
│
├── docs/                        # Documentation
│   ├── AUTHENTICATION_SYSTEM.md
│   ├── HISTORY_SERVICE.md
│   └── USER_SERVICE_BACKEND.md
│
├── vlm-models/                  # VLM model files (optional)
│   └── checkpoints/             # Downloaded model checkpoints
│       └── llava-fastvithd_1.5b_stage3/
│
├── forge.config.ts              # Electron Forge config
├── vite.*.config.ts             # Vite configurations
├── tailwind.config.js           # Tailwind CSS config
└── package.json
```

### Key Components

#### 1. BrowserManager
Manages browser tabs, navigation, and WebContentsView lifecycle.

```typescript
class BrowserManager {
  createTab(url?: string): TabInfo
  closeTab(tabId: string): boolean
  switchTab(tabId: string): boolean
  navigate(tabId: string, url: string): boolean
  // ... more methods
}
```

#### 2. ActionRecorder
Captures user interactions semantically using Chrome DevTools Protocol with VLM enhancements.

```typescript
class ActionRecorder {
  startRecording(): Promise<void>
  stopRecording(): RecordedAction[]
  getActions(): RecordedAction[]
  // Captures: clicks, typing, navigation, forms, etc.
  // VLM Features: Screenshot capture, action analysis, cleanup
}
```

#### 3. HistoryService
Manages browsing history with search, filtering, and statistics.

```typescript
class HistoryService {
  addEntry(url, title, transition, favicon): Promise<HistoryEntry>
  search(query: HistoryQuery): Promise<HistoryEntry[]>
  getStats(): Promise<HistoryStats>
  deleteEntry(id: string): Promise<boolean>
  // ... more methods
}
```

#### 4. UserService
Handles authentication, user profiles, and session management.

```typescript
class UserService {
  signIn(email, password): Promise<User>
  signUp(data): Promise<User>
  getCurrentUser(): Promise<User | null>
  updateProfile(updates): Promise<User>
  // ... more methods
}
```

---

## 🔧 Development

### Setup Development Environment

```bash
# Install dependencies
pnpm install

# Start in development mode (hot reload)
pnpm start

# Run linter
pnpm lint

# Build for production
pnpm package
```

### Environment Variables

Create a `.env` file in the root:

```env
# Optional: Backend API URL (for future cloud sync)
VITE_API_URL=http://localhost:3000

# Optional: Enable debug mode
VITE_DEBUG=true
```

### Debugging

#### Main Process
```bash
# Enable DevTools for main process
export ELECTRON_ENABLE_LOGGING=1
pnpm start
```

#### Renderer Process
- Press `Cmd+Option+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux)
- DevTools will open automatically in development mode

### Testing

```bash
# Run unit tests (coming soon)
pnpm test

# Run E2E tests (coming soon)
pnpm test:e2e
```

---

## 📚 Documentation

Comprehensive documentation is available in the `/docs` directory:

- **[Authentication System](./docs/AUTHENTICATION_SYSTEM.md)** - User management & sessions
- **[History Service](./docs/HISTORY_SERVICE.md)** - Browsing history implementation
- **[Backend Integration](./docs/USER_SERVICE_BACKEND.md)** - Future cloud sync plans
- **[Recordings Implementation](./docs/RECORDINGS_PAGE_IMPLEMENTATION.md)** - Recording system details
- **[Video Recording](./docs/VIDEO_RECORDING_SYSTEM.md)** - Video capture functionality
- **[VLM Implementation](./docs/VLM_IMPLEMENTATION.md)** - Vision language model integration and metadata enhancement
- **[Workflow Variables](./docs/WORKFLOW_VARIABLES.md)** - Variable system for dynamic automation
- **[TODO & Roadmap](./TODO.md)** - Future improvements and contributing priorities

### API Reference

#### Browser API (Renderer → Main)

```typescript
// Tab Management
window.browserAPI.createTab(url?: string): Promise<TabInfo>
window.browserAPI.closeTab(tabId: string): Promise<boolean>
window.browserAPI.switchTab(tabId: string): Promise<boolean>

// Navigation
window.browserAPI.navigate(tabId: string, url: string): Promise<boolean>
window.browserAPI.goBack(tabId: string): Promise<boolean>
window.browserAPI.goForward(tabId: string): Promise<boolean>

// Recording
window.browserAPI.startRecording(): Promise<boolean>
window.browserAPI.stopRecording(): Promise<RecordingData>
window.browserAPI.saveRecording(name, description, actions): Promise<string>

// History
window.browserAPI.getAllHistory(limit?: number): Promise<HistoryEntry[]>
window.browserAPI.searchHistory(query: HistoryQuery): Promise<HistoryEntry[]>
window.browserAPI.deleteHistoryEntry(id: string): Promise<boolean>

// User Management
window.browserAPI.signIn(email, password): Promise<User>
window.browserAPI.signUp(data): Promise<User>
window.browserAPI.getCurrentUser(): Promise<User | null>
```

---

## 🎨 UI Components

Built with **shadcn/ui** and **Tailwind CSS** for a modern, accessible interface:

- ✅ **Button** - Primary, secondary, destructive variants
- ✅ **Input** - Text, password, search fields
- ✅ **Badge** - Status indicators
- ✅ **Dialog** - Modal windows
- ✅ **Dropdown** - Context menus
- ✅ **Tabs** - Tab navigation
- ✅ **Toast** - Notifications (Sonner)
- ✅ **Checkbox** - Selection controls
- ✅ **Switch** - Toggle controls
- ✅ **Progress** - Loading indicators

### Design System

```css
/* Color Palette */
--primary: Blue (#3B82F6)
--secondary: Slate (#64748B)
--destructive: Red (#EF4444)
--success: Green (#10B981)

/* Typography */
Font Family: Inter, system-ui
Font Sizes: 12px - 48px
Line Heights: 1.2 - 1.8

/* Spacing */
Scale: 4px base (0.25rem)
```

---

## 🆕 Recent Enhancements

### VLM Integration & Action Intelligence
- **Screenshot System**: Automatic capture for 95% of user actions with strategic omissions for navigation/synthetic actions
- **Action Cleanup**: Multi-stage cleanup system that removes meaningless clicks, empty interactions, and redundant actions
- **Empty Click Detection**: Advanced analysis to identify clicks with no visible effect or undefined target values
- **VLM-Enhanced Planning**: Automation workflows now use visual context and semantic understanding for better reliability
- **Action Analysis**: Real-time detection of useless interactions with comprehensive element and effect analysis

### Automation Improvements
- **Immediate Cleanup**: Actions are cleaned as they're recorded to prevent accumulation of noise
- **Post-VLM Enhancement**: Secondary cleanup after visual analysis provides additional context
- **Smart Element Detection**: Multiple selector strategies ensure robust element targeting
- **Error Recovery**: Visual feedback helps identify and recover from automation failures
- **Confidence Scoring**: VLM provides confidence metrics for action reliability

### Architecture Updates
- **Modular Cleanup System**: Separate immediate and post-analysis cleanup phases
- **Enhanced Logging**: Comprehensive debugging information for action analysis
- **Metadata Integration**: VLM insights are preserved and used in automation planning
- **Performance Optimization**: Strategic screenshot capture balances functionality with performance

---

## 🛣️ Roadmap

### ✅ Completed
- [x] Core browser functionality
- [x] Multi-tab support
- [x] Smart workflow recording with VLM integration
- [x] Screenshot capture system (95% action coverage)
- [x] Automated action cleanup and analysis
- [x] Empty click detection and removal
- [x] Browsing history
- [x] User authentication
- [x] Settings management
- [x] Modern UI with shadcn/ui
- [x] VLM-enhanced automation planning
- [x] Visual action understanding

### 🚧 In Progress
- [ ] Full workflow replay with AI adaptation
- [ ] Advanced error recovery with visual feedback
- [ ] Cloud sync for recordings
- [ ] Browser extensions support

### 📋 Planned
- [ ] Collaborative workflows
- [ ] Marketplace for automation scripts
- [ ] Mobile companion app
- [ ] Advanced analytics dashboard
- [ ] Plugin system for extensibility
- [ ] Incognito/Private browsing mode
- [ ] Bookmark management
- [ ] Download manager
- [ ] Password manager integration
- [ ] Multi-profile support

---

## 🤝 Contributing

We welcome contributions! Here's how you can help:

### Ways to Contribute

1. **Report Bugs** - Open an issue with details
2. **Suggest Features** - Share your ideas
3. **Submit PRs** - Fix bugs or add features
4. **Improve Docs** - Help others understand the project
5. **Share Feedback** - Tell us what you think

### Development Workflow

```bash
# 1. Fork the repository
# 2. Create a feature branch
git checkout -b feature/amazing-feature

# 3. Make your changes
# 4. Commit with conventional commits
git commit -m "feat: add amazing feature"

# 5. Push to your fork
git push origin feature/amazing-feature

# 6. Open a Pull Request
```

### Commit Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: Add new feature
fix: Fix a bug
docs: Update documentation
style: Code style changes
refactor: Code refactoring
test: Add tests
chore: Maintenance tasks
```

### Code Style

- **TypeScript** - Strict mode enabled
- **ESLint** - Follow the project's ESLint config
- **Prettier** - Auto-format on save
- **React** - Functional components with hooks
- **Naming** - PascalCase for components, camelCase for functions

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2025 Abhinandan Verma

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
```

---

## 👨‍💻 Author

**Abhinandan Verma**
- Email: abhinandan@trybrowzer.com
- GitHub: [@BrowzerLabs](https://github.com/BrowzerLabs)

---

## 🙏 Acknowledgments

- **Electron** - For the amazing cross-platform framework
- **React Team** - For the powerful UI library
- **Vite** - For blazing fast build tooling
- **shadcn/ui** - For beautiful, accessible components
- **Tailwind CSS** - For utility-first styling
- **Lucide** - For the icon library
- **Open Source Community** - For inspiration and support

---

## 📞 Support

### Get Help

- 📖 **Documentation** - Check the `/docs` folder
- 🐛 **Bug Reports** - [Open an issue](https://github.com/BrowzerLabs/Browzer/issues)
- 💬 **Discussions** - [GitHub Discussions](https://github.com/BrowzerLabs/Browzer/discussions)
- 📧 **Email** - abhinandan@trybrowzer.com

### FAQ

**Q: Is my data secure?**  
A: Yes! All data is stored locally on your machine. No cloud sync (yet).

**Q: Can I use this as my daily browser?**  
A: It has core browsing features, but it's primarily designed for workflow automation.

**Q: How does the recording work?**  
A: We use Chrome DevTools Protocol to capture semantic actions, not just DOM events.

**Q: Is LLM automation available?**  
A: Basic automation with VLM enhancement is working. Full AI replay is in development.

**Q: How do I set up VLM features?**  
A: See the [VLM Setup section](#vlm-setup-optional-enhancement) and [VLM Implementation documentation](./docs/VLM_IMPLEMENTATION.md).

**Q: What if VLM setup fails?**  
A: Browzer works without VLM - you'll have basic recording. VLM adds intelligent action cleanup and visual understanding.

**Q: Can I contribute?**  
A: Absolutely! Check the [Contributing](#-contributing) section and [TODO.md](./TODO.md) for priority items.

---

## 🌟 Star History

If you find this project useful, please consider giving it a star! ⭐

[![Star History Chart](https://api.star-history.com/svg?repos=BrowzerLabs/Browzer&type=Date)](https://star-history.com/#BrowzerLabs/Browzer&Date)

---

<div align="center">

**Built with ❤️ by [Rahul](https://github.com/rahulkumaran) & [Abhinandan](https://github.com/abhi-browzer)**

[⬆ Back to Top](#-browzer)

</div>