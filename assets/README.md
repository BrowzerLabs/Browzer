# Assets Directory

This directory contains the resources needed for building distributable versions of Browzer.

## Required Icons

To build the app properly, you need to provide the following icon files:

### macOS
- `icon.icns` - macOS app icon (multiple sizes bundled in one file)

### Linux
- `icon.png` - Linux app icon (preferably 512x512 or 1024x1024 pixels)

### Windows
- `icon.ico` - Windows app icon (multiple sizes bundled in one file)

## How to Create Icons

### Option 1: Using an Icon Generator Service
1. Create a 1024x1024 PNG icon for your browser
2. Use an online service like:
   - https://cloudconvert.com/png-to-icns (for .icns)
   - https://cloudconvert.com/png-to-ico (for .ico)
   - Or use the `electron-icon-builder` package

### Option 2: Using Command Line Tools

Install electron-icon-builder:
```bash
npm install -g electron-icon-builder
```

Then generate all icons from a single 1024x1024 PNG:
```bash
electron-icon-builder --input=./icon-source.png --output=./assets --flatten
```

### Option 3: Manual Creation

#### For macOS (.icns):
```bash
# Create iconset directory
mkdir icon.iconset

# Resize your icon to different sizes and place in iconset
# Then create the .icns file
iconutil -c icns icon.iconset
```

#### For Windows (.ico):
Use tools like ImageMagick:
```bash
convert icon-1024.png -resize 256x256 -depth 8 icon.ico
```

## DMG Background (Optional)

- `dmg-background.png` - Background image for macOS DMG installer (540x380 pixels recommended)

## Current Status

- ✅ `entitlements.mac.plist` - macOS entitlements file (created)
- ⏳ `icon.icns` - macOS icon (needs to be created)
- ⏳ `icon.png` - Linux icon (needs to be created)
- ⏳ `icon.ico` - Windows icon (needs to be created)
- ⏳ `dmg-background.png` - DMG background (optional)

## Quick Start

For a quick test build, you can create a simple icon:

1. Create a 512x512 PNG icon and save it as `icon.png`
2. Copy it to `icon.icns` and `icon.ico` for now (electron-builder will handle basic conversion)
3. Run `npm run build:mac` to test the build process 