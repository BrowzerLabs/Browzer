# Workflow Performance Analysis & Optimization Plan

## Current Performance Issues

**Observed Timing:**
- AI Generation Time: 5.5s
- Total Workflow Time: 32.9s  
- **Overhead: 27.4s (83% of total time!)**

## Overhead Breakdown

### 1. **Python Process Startup** (~15-20s)
**Problem:** Each extension spawns a new Python subprocess
```python
# Current approach - creates new process every time
process = subprocess.Popen([python, script_path], ...)
```

**Overhead includes:**
- Python interpreter startup (~1-2s)
- Library imports (anthropic, requests, etc.) (~3-5s)
- AI client initialization (~5-10s)
- Extension loading (~2-3s)

### 2. **Extension Discovery** (~2-3s)
**Problem:** Reads manifest files from disk every execution
```python
# Runs on every call
for ext_dir in extension_dirs:
    with open(manifest_file, 'r') as f:
        manifest = json.load(f)
```

### 3. **Data Serialization** (~3-5s)
**Problem:** Large page content serialized to JSON through stdin/stdout
```python
input_json = json.dumps({
    "pageContent": huge_html_content,  # 50KB+ of HTML
    ...
})
```

### 4. **No Caching/Reuse** (~5-10s)
**Problem:** Everything rebuilt from scratch each time
- No extension registry cache
- No process reuse  
- No shared AI clients

## Optimization Solutions

### 🚀 **Process Pooling** (Saves 15-20s)
Keep warm Python processes running:

```python
class ExtensionProcessPool:
    def __init__(self):
        self.warm_processes = {}  # extension_id -> running_process
    
    def get_process(self, extension_id):
        if extension_id not in self.warm_processes:
            # Start once, reuse many times
            self.warm_processes[extension_id] = start_daemon_process(extension_id)
        return self.warm_processes[extension_id]
```

**Benefits:**
- ✅ Python startup: ~2s → 0s
- ✅ Library loading: ~5s → 0s  
- ✅ AI client init: ~10s → 0s

### 🗂️ **Extension Registry Cache** (Saves 2-3s)
Load all manifests once at startup:

```python
class ExtensionRegistry:
    def __init__(self):
        self.extensions = self._load_all_manifests_once()  # Cache
```

### 💾 **Shared Memory for Large Data** (Saves 3-5s)
Use temp files instead of JSON for large content:

```python
# Instead of JSON serialization
page_content_file = write_to_temp_file(page_content)
input_data = {"pageContentFile": page_content_file}
```

### 🔄 **AI Client Connection Pool** (Saves 5-10s)
Share authenticated clients across extensions:

```python
class AIClientPool:
    def __init__(self):
        self.clients = {"anthropic": AnthropicClient(), ...}
    
    def get_client(self, provider):
        return self.clients[provider]  # Reuse existing
```

## Expected Performance Improvement

| Component | Current | Optimized | Savings |
|-----------|---------|-----------|---------|
| Process Startup | ~20s | ~0s | 20s |
| Extension Discovery | ~3s | ~0s | 3s |
| Data Serialization | ~5s | ~1s | 4s |
| **Total** | **32.9s** | **~6.5s** | **26.4s** |

**Result: 5x speedup (33s → 6.5s workflows)**

## Implementation Priority

### Phase 1: Quick Wins (1-2 days)
1. **Extension Registry Cache** - Easy, 2-3s improvement
2. **Shared Memory for Large Data** - Medium effort, 3-5s improvement

### Phase 2: Major Optimization (3-5 days)  
3. **Process Pooling** - Requires daemon mode for extensions, 15-20s improvement
4. **AI Client Pool** - Requires extension refactoring, 5-10s improvement

## Real-World Impact

**Current Experience:**
- User asks question
- Waits 33 seconds 
- Gets 5.5s worth of actual AI work

**Optimized Experience:**
- User asks question  
- Waits 6.5 seconds
- Gets same 5.5s worth of AI work

**Improvement: 5x faster workflows with same quality results!** 