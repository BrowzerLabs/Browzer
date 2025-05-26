# CI/CD Pipeline Guide

This repository includes automated GitHub Actions workflows for building and releasing the Browzer application across multiple platforms.

## 🚀 Automated Workflows

### 1. Build Test Workflow (`build-test.yml`)

**Triggers:**
- Pull requests to `main` branch
- Pushes to `main` branch

**What it does:**
- Tests builds on macOS, Linux, and Windows
- Validates that the application can be built successfully
- Ensures Python dependencies are properly bundled
- Runs on every PR to catch build issues early

### 2. Release Workflow (`release.yml`)

**Triggers:**
- Git tags matching `v*.*.*` pattern (e.g., `v1.0.0`, `v2.1.3`)
- Manual trigger via GitHub Actions UI

**What it does:**
- Builds distributable packages for all platforms:
  - **macOS**: DMG and ZIP files (Intel + Apple Silicon)
  - **Linux**: AppImage, DEB, RPM, and TAR.GZ packages
  - **Windows**: NSIS installer and portable executable
- Automatically creates a GitHub Release
- Uploads all build artifacts to the release
- Generates release notes from commits

## 📦 Creating a Release

### Method 1: Using Git Tags (Recommended)

1. **Update version in package.json:**
   ```bash
   # Edit package.json and update the version field
   "version": "1.2.0"
   ```

2. **Commit the version change:**
   ```bash
   git add package.json
   git commit -m "Bump version to 1.2.0"
   git push origin main
   ```

3. **Create and push a tag:**
   ```bash
   git tag v1.2.0
   git push origin v1.2.0
   ```

4. **Wait for the build:**
   - The release workflow will automatically start
   - Monitor progress in the "Actions" tab on GitHub
   - Build takes approximately 15-20 minutes

5. **Release is published:**
   - Check the "Releases" tab for your new release
   - All platform packages will be available for download

### Method 2: Manual Trigger

1. Go to the "Actions" tab in your GitHub repository
2. Select "Build and Release" workflow
3. Click "Run workflow"
4. Choose the branch and click "Run workflow"

## 🔧 Build Artifacts

Each release includes the following files:

### macOS
- `Browzer-{version}.dmg` - Disk image installer (Intel)
- `Browzer-{version}-arm64.dmg` - Disk image installer (Apple Silicon)
- `Browzer-{version}-mac.zip` - ZIP archive (Intel)
- `Browzer-{version}-arm64-mac.zip` - ZIP archive (Apple Silicon)

### Linux
- `Browzer-{version}.AppImage` - Portable application
- `browzer_{version}_amd64.deb` - Debian package
- `browzer-{version}.x86_64.rpm` - RPM package
- `browzer-{version}.tar.gz` - TAR archive

### Windows
- `Browzer Setup {version}.exe` - NSIS installer
- `Browzer {version}.exe` - Portable executable

## 🛠️ Pipeline Features

### Python Bundle Integration
- Automatically creates a self-contained Python runtime
- Includes all required packages: requests, beautifulsoup4, python-dotenv, openai, anthropic, nltk
- Downloads NLTK data during build process
- No manual Python setup required for end users

### Cross-Platform Building
- Uses GitHub's hosted runners for consistent builds
- macOS builds on `macos-latest`
- Linux builds on `ubuntu-latest`
- Windows builds on `windows-latest`

### Artifact Management
- Build artifacts are temporarily stored during the workflow
- Only tagged releases are published to GitHub Releases
- Failed builds don't create releases

## 🔍 Monitoring Builds

### Viewing Build Status
1. Go to the "Actions" tab in your repository
2. Click on the workflow run you want to monitor
3. View logs for each platform build

### Common Build Issues
- **Python dependencies**: Ensure all required packages are listed in the workflow
- **Node.js dependencies**: Make sure `package-lock.json` is committed
- **Asset files**: Verify icon files exist in the `assets/` directory
- **Build scripts**: Ensure `npm run build:mac/linux/win` commands work locally

## 📋 Prerequisites

### Repository Setup
- Repository must have GitHub Actions enabled
- No additional secrets required (uses built-in `GITHUB_TOKEN`)
- Ensure `package.json` has correct build configuration

### Local Development
- Node.js 18+ installed
- Python 3.11+ installed
- All dependencies installed via `npm install`

## 🚨 Troubleshooting

### Build Failures
1. Check the Actions logs for specific error messages
2. Ensure the build works locally with `npm run build`
3. Verify all required files are committed to the repository

### Release Not Created
- Ensure you're pushing a tag that matches `v*.*.*` pattern
- Check that the tag is pushed to the remote repository
- Verify the workflow completed successfully

### Missing Artifacts
- Check that the build completed without errors
- Ensure the `dist/` directory contains the expected files
- Verify the artifact upload steps succeeded

## 🔄 Updating the Pipeline

To modify the CI/CD pipeline:

1. Edit `.github/workflows/release.yml` or `.github/workflows/build-test.yml`
2. Test changes on a feature branch first
3. Monitor the workflow runs to ensure changes work correctly

## 📚 Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [electron-builder Documentation](https://www.electron.build/)
- [Semantic Versioning](https://semver.org/) 