#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  // Create destination directory if it doesn't exist
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }

  // Get all files and directories in the source
  const items = fs.readdirSync(src);

  for (const item of items) {
    const srcPath = path.join(src, item);
    const destPath = path.join(dest, item);
    const stat = fs.statSync(srcPath);

    if (stat.isDirectory()) {
      // Recursively copy directories
      copyDir(srcPath, destPath);
    } else if (item.endsWith('.py')) {
      // Only copy Python files
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${srcPath} -> ${destPath}`);
    }
  }
}

function main() {
  console.log('Copying Python files to dist directory...');
  
  const srcDir = path.join(__dirname, '..', 'extensions-framework');
  const destDir = path.join(__dirname, '..', 'dist', 'extensions-framework');

  if (!fs.existsSync(srcDir)) {
    console.log('Source extensions-framework directory not found');
    return;
  }

  try {
    copyDir(srcDir, destDir);
    console.log('Python files copied successfully!');
  } catch (error) {
    console.error('Error copying Python files:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { copyDir }; 