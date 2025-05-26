# Browzer App Build Guide

This guide explains how to build distributable versions of Browzer for macOS, Linux, and Windows.

## Prerequisites

### Required Software
- Node.js (v16 or higher)
- npm or yarn
- Python 3.8+ (for the AI agents)

### Platform-Specific Requirements

#### macOS
- Xcode Command Line Tools
- Valid Apple Developer ID (for code signing and notarization)
  ```bash
  xcode-select --install
  ```

#### Linux
- Standard build tools
  ```bash
  # Ubuntu/Debian
  sudo apt-get install build-essential
  
  # RHEL/CentOS/Fedora
  sudo yum groupinstall "Development Tools"
  ```

#### Windows (Cross-compilation from macOS/Linux)
- Wine (for building Windows apps on non-Windows systems)

## Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Python Agents
```bash
# macOS/Linux
npm run setup

# Windows
npm run setup-win
```

### 3. Verify Icons
Check that these files exist in the `assets/` directory:
- ✅ `icon.icns` (macOS)
- ✅ `icon.ico` (Windows) 
- ✅ `icon.png` (Linux)
- ✅ `entitlements.mac.plist` (macOS entitlements)

## Building the App

### Quick Start - Test Build
```bash
# Test build without distribution (faster)
npm run pack
```

### Platform-Specific Builds

#### macOS DMG
```bash
npm run build:mac
```
**Output:** `dist/Browzer-1.0.0.dmg` and `dist/Browzer-1.0.0-mac.zip`

#### Linux AppImage/DEB/RPM
```bash
npm run build:linux
```
**Output:** 
- `dist/Browzer-1.0.0.AppImage`
- `dist/browzer_1.0.0_amd64.deb`
- `dist/browzer-1.0.0.x86_64.rpm`
- `dist/browzer-1.0.0.tar.gz`

#### Windows Installer
```bash
npm run build:win
```
**Output:**
- `dist/Browzer Setup 1.0.0.exe` (NSIS installer)
- `dist/Browzer 1.0.0.exe` (Portable version)

#### All Platforms
```bash
npm run build:all
```

## Code Signing & Notarization (macOS)

For distribution outside the Mac App Store, you need to sign and notarize your app.

### 1. Get Apple Developer ID
- Join the Apple Developer Program ($99/year)
- Create a Developer ID Application certificate

### 2. Configure Signing
Add to your environment or CI/CD:
```bash
export CSC_LINK="path/to/certificate.p12"
export CSC_KEY_PASSWORD="certificate_password"
export APPLE_ID="your@apple.id"
export APPLE_APP_SPECIFIC_PASSWORD="app-specific-password"
export APPLE_TEAM_ID="your_team_id"
```

### 3. Enable Notarization
Update `package.json` build config:
```json
{
  "build": {
    "mac": {
      "notarize": {
        "teamId": "YOUR_TEAM_ID"
      }
    }
  }
}
```

## File Size Optimization

### Reduce Bundle Size
The Python agents and dependencies can make the app quite large. To optimize:

1. **Exclude unnecessary files:**
   - Python virtual environments are excluded by default
   - Compiled Python files (`.pyc`) are excluded

2. **Optimize Python requirements:**
   ```bash
   # In agents directory, remove unused packages
   pip freeze > requirements.txt
   # Edit requirements.txt to remove unused packages
   pip install -r requirements.txt --force-reinstall
   ```

3. **Use electron-builder's compression:**
   ```json
   {
     "build": {
       "compression": "maximum",
       "nsis": {
         "oneClick": false,
         "allowToChangeInstallationDirectory": true
       }
     }
   }
   ```

## Distribution

### macOS
- **DMG file:** Users drag to Applications folder
- **Notarization:** Required for distribution outside Mac App Store
- **Gatekeeper:** Signed apps will work without warnings

### Linux
- **AppImage:** Universal, portable format
- **DEB:** For Debian/Ubuntu systems (`sudo dpkg -i browzer_1.0.0_amd64.deb`)
- **RPM:** For RHEL/CentOS/Fedora (`sudo rpm -i browzer-1.0.0.x86_64.rpm`)

### Windows
- **NSIS Installer:** Professional installer with uninstall support
- **Portable:** Single executable, no installation required

## Automatic Updates

To enable automatic updates, consider using:
- [electron-updater](https://www.electron.build/auto-update)
- Configure update servers
- Add update checking to your main process

Example update configuration:
```json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "your-username",
      "repo": "browzer"
    }
  }
}
```

## CI/CD Pipeline

### GitHub Actions Example
Create `.github/workflows/build.yml`:
```yaml
name: Build and Release

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ${{ matrix.os }}
    strategy:
      matrix:
        os: [macos-latest, ubuntu-latest, windows-latest]
    
    steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm install
    
    - name: Build app
      run: npm run build
    
    - name: Upload artifacts
      uses: actions/upload-artifact@v3
      with:
        name: builds-${{ matrix.os }}
        path: dist/
```

## Troubleshooting

### Common Issues

1. **Python agent not found**
   - Ensure Python requirements are installed
   - Check that agents directory is included in build

2. **Icon not showing**
   - Verify icon files exist in assets directory
   - Check icon format and size requirements

3. **Code signing failures (macOS)**
   - Verify Developer ID certificate
   - Check entitlements file
   - Ensure team ID is correct

4. **Large file size**
   - Exclude unnecessary dependencies
   - Use compression settings
   - Consider lazy-loading Python components

### Debug Build Issues
```bash
# Enable verbose output
DEBUG=electron-builder npm run build

# Build without compression for faster testing
npm run pack
```

## Release Checklist

- [ ] Update version in `package.json`
- [ ] Test app functionality
- [ ] Build for all target platforms
- [ ] Test installers on clean systems
- [ ] Sign and notarize (macOS)
- [ ] Create release notes
- [ ] Upload to distribution platforms
- [ ] Update documentation

## Security Considerations

- Never include API keys in the built app
- Use secure update mechanisms
- Validate all external inputs
- Follow platform security guidelines
- Consider app sandboxing where appropriate

---

For more detailed information, see:
- [Electron Builder Documentation](https://www.electron.build/)
- [Apple Notarization Guide](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Windows Code Signing](https://docs.microsoft.com/en-us/windows/win32/seccrypto/cryptography-tools) 