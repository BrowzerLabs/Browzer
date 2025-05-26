# 🐍 Browzer - Bundled Python Runtime

## 🎉 **What's New**

Browzer now includes a **completely self-contained Python runtime** with all required AI packages! Users no longer need to install Python or any dependencies manually.

## 📦 **What's Included**

### Python Runtime
- **Python 3.11.7** (Latest stable version)
- **Portable installation** - Works without system Python
- **All required packages pre-installed**:
  - `requests==2.32.3` - Web requests
  - `beautifulsoup4==4.13.4` - Web scraping
  - `python-dotenv==1.1.0` - Environment variables
  - `openai==1.82.0` - OpenAI API integration
  - `anthropic==0.52.0` - Claude API integration

### Bundle Size
- **~52MB** - Adds only ~15-20MB to the final app package
- **Cross-platform** - Separate bundles for Intel and Apple Silicon Macs

## 🚀 **User Experience**

### Before (Manual Setup Required)
```bash
# Users had to manually install Python and packages
brew install python3
pip3 install requests beautifulsoup4 python-dotenv openai anthropic
```

### After (Zero Setup Required)
```bash
# Just install the DMG/ZIP and everything works!
# No Python installation needed
# No package management required
# No PATH configuration necessary
```

## 🛠 **How It Works**

### 1. Build Process
- **Pre-build**: Automatically creates portable Python environment
- **Bundling**: Includes Python runtime in app package as `extraFiles`
- **Verification**: Tests all packages before packaging

### 2. Runtime Detection
The app automatically detects and uses:
1. **Bundled Python** (Production) - `/Contents/Resources/python-runtime/bin/python`
2. **Development venv** (Development) - `./agents/venv/bin/python`
3. **System Python** (Fallback) - `python3` from PATH

### 3. File Structure
```
Browzer.app/
├── Contents/
│   ├── Resources/
│   │   ├── python-runtime/          # 🆕 Bundled Python
│   │   │   ├── bin/python           # Python executable
│   │   │   ├── lib/python3.11/      # Python packages
│   │   │   │   └── site-packages/   # AI packages
│   │   │   └── verify.py            # Verification script
│   │   ├── agents/                  # AI agent scripts
│   │   └── app.asar                 # Main app files
│   └── MacOS/Browzer                # App executable
```

## 🔧 **Development Commands**

### For Developers
```bash
# Prepare Python bundle manually
npm run prepare-python

# Test bundled Python
./test-bundled-python.sh

# Build with bundled Python (automatic)
npm run build

# Check Python setup (diagnostic)
./check_python.sh
```

### Bundle Management
```bash
# Clean bundle
rm -rf python-bundle/

# Rebuild bundle
npm run prepare-python

# Verify bundle
./test-bundled-python.sh
```

## 📊 **Package Sizes**

| Package Type | Without Python | With Python | Difference |
|--------------|----------------|-------------|------------|
| macOS ZIP (Intel) | ~92MB | ~108MB | +16MB |
| macOS ZIP (ARM64) | ~87MB | ~103MB | +16MB |
| Linux AppImage | ~100MB | ~115MB* | +15MB |

*_Linux builds use system Python for better compatibility_

## 🐛 **Troubleshooting**

### Python Bundle Issues
```bash
# If bundle is corrupted
npm run prepare-python

# If build fails
rm -rf python-bundle/ node_modules/
npm install
npm run build
```

### Runtime Issues
The app logs detailed Python information to:
- **macOS**: `~/Library/Application Support/Browzer/agent-execution.log`
- **Linux**: `~/.config/Browzer/agent-execution.log`

### Debug Commands
```bash
# Test bundled Python directly
./python-bundle/python-runtime/bin/python -c "import requests; print('OK')"

# Verify all packages
./python-bundle/python-runtime/bin/python ./python-bundle/python-runtime/verify.py
```

## 🎯 **Benefits**

### For Users
✅ **Zero setup** - Just install and use  
✅ **No dependencies** - Everything included  
✅ **Cross-platform** - Works on any Mac  
✅ **Reliable** - No version conflicts  
✅ **Offline capable** - No internet needed for AI packages  

### For Developers
✅ **Consistent environment** - Same Python everywhere  
✅ **Reproducible builds** - Locked package versions  
✅ **Easy distribution** - Single package contains everything  
✅ **Automated bundling** - Integrated into build process  

## 🔮 **Future Enhancements**

- [ ] **Windows support** - Bundle Python for Windows builds
- [ ] **Package updates** - Automatic Python package updates
- [ ] **Multiple Python versions** - Support for different Python versions
- [ ] **Custom packages** - Allow users to add custom packages

## 📚 **Technical Details**

### Virtual Environment
- Uses Python's `venv` with `--copies` flag for portability
- Removes absolute paths for relocatability
- Includes all dependencies and their sub-dependencies

### Build Integration
- `prebuild` script automatically prepares bundle
- `extraFiles` configuration includes bundle in app package
- Runtime detection prioritizes bundled Python over system Python

### Package Management
- Locked to specific versions for stability
- No-cache installation for clean builds
- Verification step ensures all packages work correctly

---

**🎉 Browzer now provides a complete, self-contained AI browser experience!** 