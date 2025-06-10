const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const archiver = require('archiver');

// Simple build script for Electron app that works with Node.js 14
async function buildApp() {
  console.log('🔨 Building Browzer app...');
  
  // Check if we have electron
  try {
    const electronPath = require('electron');
    console.log('✅ Electron found at:', electronPath);
  } catch (e) {
    console.error('❌ Electron not found. Run: npm install electron');
    process.exit(1);
  }
  
  // Create dist directory
  const distDir = path.join(__dirname, 'dist');
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir);
  }
  
  // Package for current platform
  const platform = process.platform;
  console.log(`📦 Packaging for ${platform}...`);
  
  if (platform === 'darwin') {
    await buildMacOS();
  } else if (platform === 'linux') {
    await buildLinux();
  } else if (platform === 'win32') {
    await buildWindows();
  } else {
    console.error('❌ Unsupported platform:', platform);
    process.exit(1);
  }
}

async function buildMacOS() {
  console.log('🍎 Building for macOS...');
  
  // Use electron-packager if available, otherwise create a basic package
  try {
    const packager = require('electron-packager');
    
    const options = {
      dir: '.',
      name: 'Browzer',
      platform: 'darwin',
      arch: 'x64',
      out: './dist',
      overwrite: true,
      icon: './assets/icon.icns',
      ignore: [
        /node_modules\/electron-builder/,
        /\.git/,
        /dist/,
        /agents\/venv/,
        /\.env/
      ]
    };
    
    const appPaths = await packager(options);
    console.log('✅ macOS app built at:', appPaths[0]);
    
    // Create DMG manually using hdiutil
    await createDMG(appPaths[0]);
    
  } catch (e) {
    console.error('❌ electron-packager not found. Installing...');
    await installPackager();
    await buildMacOS();
  }
}

async function buildLinux() {
  console.log('🐧 Building for Linux...');
  
  try {
    const packager = require('electron-packager');
    
    const options = {
      dir: '.',
      name: 'Browzer',
      platform: 'linux',
      arch: 'x64',
      out: './dist',
      overwrite: true,
      icon: './assets/icon.png',
      ignore: [
        /node_modules\/electron-builder/,
        /\.git/,
        /dist/,
        /agents\/venv/,
        /\.env/
      ]
    };
    
    const appPaths = await packager(options);
    console.log('✅ Linux app built at:', appPaths[0]);
    
    // Create tar.gz archive
    await createTarGz(appPaths[0]);
    
  } catch (e) {
    console.error('❌ electron-packager not found. Installing...');
    await installPackager();
    await buildLinux();
  }
}

async function buildWindows() {
  console.log('🪟 Building for Windows...');
  
  try {
    const packager = require('electron-packager');
    
    const options = {
      dir: '.',
      name: 'Browzer',
      platform: 'win32',
      arch: 'x64',
      out: './dist',
      overwrite: true,
      icon: './assets/icon.ico',
      ignore: [
        /node_modules\/electron-builder/,
        /\.git/,
        /dist/,
        /agents\/venv/,
        /\.env/
      ]
    };
    
    const appPaths = await packager(options);
    console.log('✅ Windows app built at:', appPaths[0]);
    
    // Create ZIP archive
    await createZip(appPaths[0]);
    
  } catch (e) {
    console.error('❌ electron-packager not found. Installing...');
    await installPackager();
    await buildWindows();
  }
}

async function installPackager() {
  return new Promise((resolve, reject) => {
    console.log('📦 Installing electron-packager...');
    const install = spawn('npm', ['install', '--save-dev', 'electron-packager'], {
      stdio: 'inherit'
    });
    
    install.on('close', (code) => {
      if (code === 0) {
        console.log('✅ electron-packager installed');
        resolve();
      } else {
        reject(new Error('Failed to install electron-packager'));
      }
    });
  });
}

async function createDMG(appPath) {
  return new Promise((resolve, reject) => {
    const appName = path.basename(appPath);
    const dmgPath = path.join('./dist', `${appName}.dmg`);
    
    console.log(`📀 Creating DMG: ${dmgPath}`);
    
    const hdiutil = spawn('hdiutil', [
      'create',
      '-srcfolder', appPath,
      '-format', 'UDZO',
      '-volname', 'Browzer',
      dmgPath
    ]);
    
    hdiutil.on('close', (code) => {
      if (code === 0) {
        console.log('✅ DMG created:', dmgPath);
        resolve(dmgPath);
      } else {
        console.log('⚠️ DMG creation failed, but app is still built');
        resolve();
      }
    });
    
    hdiutil.on('error', () => {
      console.log('⚠️ hdiutil not found, skipping DMG creation');
      resolve();
    });
  });
}

async function createTarGz(appPath) {
  return new Promise((resolve, reject) => {
    const appName = path.basename(appPath);
    const tarPath = path.join('./dist', `${appName}.tar.gz`);
    
    console.log(`📦 Creating tar.gz: ${tarPath}`);
    
    const output = fs.createWriteStream(tarPath);
    const archive = archiver('tar', { gzip: true });
    
    output.on('close', () => {
      console.log('✅ tar.gz created:', tarPath);
      resolve(tarPath);
    });
    
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(appPath, appName);
    archive.finalize();
  });
}

async function createZip(appPath) {
  return new Promise((resolve, reject) => {
    const appName = path.basename(appPath);
    const zipPath = path.join('./dist', `${appName}.zip`);
    
    console.log(`📦 Creating ZIP: ${zipPath}`);
    
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip');
    
    output.on('close', () => {
      console.log('✅ ZIP created:', zipPath);
      resolve(zipPath);
    });
    
    archive.on('error', reject);
    archive.pipe(output);
    archive.directory(appPath, appName);
    archive.finalize();
  });
}

// Run the build
if (require.main === module) {
  buildApp().catch(console.error);
}

module.exports = { buildApp }; 