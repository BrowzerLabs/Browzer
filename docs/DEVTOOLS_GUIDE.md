# 🔧 Chrome DevTools in Browzer

This guide explains how to use Chrome DevTools in the Browzer Electron application for debugging web pages, inspecting elements, and analyzing network traffic.

## 🚀 Quick Start

### Opening DevTools

There are multiple ways to open DevTools for any page:

1. **Keyboard Shortcuts:**
   - `F12` - Toggle DevTools
   - `Ctrl+Shift+I` (Windows/Linux) or `Cmd+Option+I` (Mac) - Open DevTools
   - `Ctrl+Shift+J` (Windows/Linux) or `Cmd+Option+J` (Mac) - Open DevTools Console
   - `Ctrl+Shift+C` (Windows/Linux) or `Cmd+Option+C` (Mac) - Open DevTools Element Inspector

2. **Toolbar Button:**
   - Click the 🔧 DevTools button in the toolbar

3. **Right-Click Context Menu:**
   - Right-click on any page element
   - Select "Inspect Element" from the context menu

4. **Double-Click (Debug Mode):**
   - Hold `Ctrl` or `Cmd` and double-click on any page element

## 📋 Features

### ✅ Available DevTools Features

- **Elements Panel**: Inspect HTML structure and CSS styles
- **Console Panel**: JavaScript console with full access to page context
- **Sources Panel**: Debug JavaScript, set breakpoints, view source files
- **Network Panel**: Monitor network requests, analyze performance
- **Performance Panel**: Profile page performance and identify bottlenecks
- **Memory Panel**: Analyze memory usage and detect memory leaks
- **Security Panel**: Check security state and certificate information
- **Audits Panel**: Run Lighthouse audits for performance and accessibility

### 🎯 Key Capabilities

- **Full Chrome DevTools**: Complete Chrome DevTools functionality
- **Multi-Tab Support**: Open DevTools for each tab independently
- **Detached Mode**: DevTools open in separate windows
- **Source Maps**: Support for source maps and debugging transpiled code
- **Hot Reload**: Real-time updates when page content changes

## 🛠️ Usage Examples

### 1. Inspecting Elements

```javascript
// Right-click on any element and select "Inspect Element"
// Or use keyboard shortcut Ctrl+Shift+C (Cmd+Option+C on Mac)

// In the Elements panel, you can:
// - View HTML structure
// - Edit HTML in real-time
// - Modify CSS styles
// - See computed styles
// - Check accessibility properties
```

### 2. Console Debugging

```javascript
// Open DevTools Console with Ctrl+Shift+J (Cmd+Option+J on Mac)

// Common console commands:
console.log('Debug message');
console.error('Error message');
console.warn('Warning message');
console.table(data); // Display data in table format

// Inspect page elements:
$0 // Currently selected element
$1 // Previously selected element
$('selector') // Query selector (jQuery-style)
$$('selector') // Query selector all

// Monitor events:
monitorEvents(document, 'click');
unmonitorEvents(document, 'click');
```

### 3. Network Analysis

```javascript
// Open DevTools and go to Network tab
// Reload page to see all network requests

// Filter requests by:
// - Type (XHR, JS, CSS, Images, etc.)
// - Status codes
// - Domain
// - Size

// Analyze:
// - Request/response headers
// - Request payload
// - Response content
// - Timing information
```

### 4. Performance Profiling

```javascript
// Open DevTools Performance tab
// Click Record button
// Perform actions on the page
// Stop recording to analyze

// Analyze:
// - CPU usage
// - Memory usage
// - Frame rate
// - JavaScript execution time
// - Rendering performance
```

## 🎨 Context Menu Options

When you right-click on any page, you'll see these options:

- **Inspect Element** - Open DevTools focused on the clicked element
- **View Page Source** - View the HTML source in a new window
- **Reload Page** - Refresh the current page
- **Go Back** - Navigate back in history (if available)
- **Go Forward** - Navigate forward in history (if available)

## ⚙️ Configuration

### DevTools Settings

DevTools are automatically enabled for all webviews with these settings:

```javascript
// In webview configuration:
webPreferences: [
  'devTools=true',           // Enable DevTools
  'contextMenu=true',        // Enable context menu
  'nodeIntegration=false',   // Security: disable Node.js integration
  'contextIsolation=true',   // Security: enable context isolation
  'webSecurity=true'         // Security: enable web security
]
```

### Keyboard Shortcuts

All standard Chrome DevTools keyboard shortcuts work:

| Shortcut | Action |
|----------|--------|
| `F12` | Toggle DevTools |
| `Ctrl+Shift+I` / `Cmd+Option+I` | Open DevTools |
| `Ctrl+Shift+J` / `Cmd+Option+J` | Open Console |
| `Ctrl+Shift+C` / `Cmd+Option+C` | Element Inspector |
| `Ctrl+Shift+Delete` / `Cmd+Option+Delete` | Clear Storage |
| `Ctrl+R` / `Cmd+R` | Reload Page |
| `Ctrl+Shift+R` / `Cmd+Shift+R` | Hard Reload |
| `Ctrl+U` / `Cmd+U` | View Source |

## 🔍 Debugging Techniques

### 1. Element Inspection

```javascript
// Select element in Elements panel
// Right-click for options:
// - Edit as HTML
// - Copy selector
// - Copy XPath
// - Hide element
// - Delete element
// - Scroll into view
```

### 2. JavaScript Debugging

```javascript
// Set breakpoints in Sources panel
// Use debugger statement in code:
debugger;

// Step through code:
// - Step over (F10)
// - Step into (F11)
// - Step out (Shift+F11)
// - Continue (F8)

// Watch expressions and variables
// Inspect call stack
// View scope variables
```

### 3. Network Debugging

```javascript
// Monitor AJAX requests
// Check response codes
// Analyze request timing
// Inspect headers and cookies
// Test API endpoints

// Simulate network conditions:
// - Slow 3G
// - Fast 3G
// - Offline mode
```

### 4. Performance Optimization

```javascript
// Use Performance tab to:
// - Identify slow functions
// - Find memory leaks
// - Analyze rendering performance
// - Check frame rate
// - Optimize JavaScript execution

// Use Memory tab to:
// - Take heap snapshots
// - Record heap allocations
// - Find memory leaks
// - Analyze object retention
```

## 🚨 Troubleshooting

### Common Issues

1. **DevTools Not Opening**
   - Check if `devTools=true` is set in webPreferences
   - Verify keyboard shortcuts are not blocked
   - Try different opening methods (button, context menu, shortcuts)

2. **Console Not Working**
   - Ensure page has finished loading
   - Check for JavaScript errors preventing console access
   - Try refreshing the page

3. **Network Tab Empty**
   - Refresh the page after opening DevTools
   - Check if network requests are being blocked
   - Verify page is making actual network requests

4. **Sources Not Loading**
   - Check if source maps are available
   - Ensure JavaScript files are not minified without source maps
   - Verify file paths are correct

### Debug Commands

```javascript
// Check DevTools availability
console.log('DevTools available:', !!window.chrome?.devtools);

// List all open DevTools windows
devToolsManager.getOpenDevToolsWindows();

// Close all DevTools windows
devToolsManager.closeAllDevTools();

// Get active webview
const activeWebview = document.querySelector('.webview.active');
console.log('Active webview:', activeWebview);
```

## 🔒 Security Considerations

### Safe Debugging Practices

1. **Context Isolation**: DevTools run in isolated context for security
2. **No Node.js Access**: DevTools cannot access Node.js APIs
3. **Sandboxed Environment**: DevTools run in sandboxed environment
4. **HTTPS Only**: Use HTTPS for sensitive debugging sessions

### Production vs Development

```javascript
// Development mode - DevTools always available
if (process.env.NODE_ENV === 'development') {
  // Main window DevTools auto-open
  mainWindow.webContents.openDevTools();
}

// Production mode - DevTools available but not auto-opened
// Users can still open DevTools manually if needed
```

## 📊 Performance Monitoring

### Key Metrics to Monitor

1. **Page Load Time**
   - Time to first byte (TTFB)
   - First contentful paint (FCP)
   - Largest contentful paint (LCP)
   - Time to interactive (TTI)

2. **Runtime Performance**
   - JavaScript execution time
   - Rendering performance
   - Memory usage
   - CPU usage

3. **Network Performance**
   - Request count
   - Total transfer size
   - Compression effectiveness
   - Caching efficiency

### Performance Tips

```javascript
// Use Performance tab to:
// 1. Record page load performance
// 2. Identify slow JavaScript functions
// 3. Find layout thrashing
// 4. Optimize rendering performance
// 5. Reduce memory usage

// Common performance issues:
// - Unused JavaScript/CSS
// - Large images
// - Synchronous scripts
// - Memory leaks
// - Excessive DOM manipulation
```

## 🎯 Advanced Features

### Custom DevTools Extensions

```javascript
// DevTools extensions work if installed in Chrome
// Common useful extensions:
// - React Developer Tools
// - Vue.js devtools
// - Redux DevTools
// - Lighthouse
```

### Remote Debugging

```javascript
// For advanced debugging scenarios:
// - Remote debugging protocol
// - Headless Chrome debugging
// - Automated testing integration
```

## 📝 Best Practices

1. **Use Appropriate Panels**
   - Elements for HTML/CSS debugging
   - Console for JavaScript debugging
   - Network for API/resource debugging
   - Performance for optimization

2. **Keyboard Shortcuts**
   - Learn common shortcuts for efficiency
   - Use F12 for quick access
   - Use Ctrl+Shift+C for element inspection

3. **Debugging Workflow**
   - Start with Console for quick debugging
   - Use Elements for layout issues
   - Use Network for API problems
   - Use Performance for optimization

4. **Security**
   - Don't debug sensitive data in production
   - Be aware of what information is exposed
   - Use HTTPS for secure debugging

---

**Happy Debugging! 🐛➡️✨**

Chrome DevTools in Browzer provides the full power of Chrome's debugging capabilities, making it easy to develop, debug, and optimize web applications within the Electron environment. 