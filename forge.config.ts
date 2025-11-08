import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'path';


const config: ForgeConfig = {
  packagerConfig: {
    name: 'Browzer',
    asar: true,
    icon: './assets/icon',
    appBundleId: 'com.browzer.app',
    appCategoryType: 'public.app-category.productivity',
   osxSign: {
      identity: process.env.APPLE_IDENTITY!,
      identityValidation: true,
      optionsForFile: (filePath) => {
        return {
          entitlements: path.join(__dirname, 'entitlements.mac.plist')
        };
      }
    },
    osxNotarize: {
      appleId: process.env.APPLE_ID!,
      appleIdPassword: process.env.APPLE_ID_PASSWORD!,
      teamId: process.env.APPLE_TEAM_ID!
    },
    darwinDarkModeSupport: true
  },
  rebuildConfig: {},
  makers: [
    new MakerSquirrel({}),
    new MakerDMG({
      background: './assets/dmg-background.png',
      icon: './assets/icon.icns',
      format: 'ULFO',
      contents: (opts) => {
        return [
          { x: 130, y: 220, type: 'file', path: opts.appPath },
          { x: 410, y: 220, type: 'link', path: '/Applications' }
        ];
      },
      additionalDMGOptions: {
        window: { size: { width: 540, height: 380 } },
        "background-color": "#fff",
      }
    }),
    new MakerZIP({}, ['darwin']),
    
    new MakerDeb({
      options: {
        name: 'browzer',
        productName: 'Browzer',
        genericName: 'Web Browser',
        description: 'An Intelligent Agentic Browser',
        categories: ['Network', 'Office'],
        icon: './assets/icon.png',
        homepage: 'https://github.com/BrowzerLabs/Browzer',
        maintainer: 'Browzer <rahul@trybrowzer.com>',
        section: 'web'
      }
    }),
    
    new MakerRpm({
      options: {
        name: 'browzer',
        productName: 'Browzer',
        icon: './assets/icon.png',
        categories: ['Network', 'Office']
      }
    })
  ],
  publishers: [
    {
       name: '@electron-forge/publisher-github',
       config: {
         repository: {
           owner: 'BrowzerLabs',
           name: 'Browzer'
         },
         prerelease: true
       }
    }
  ],
  plugins: [
    new VitePlugin({
      build: [
        {
          entry: 'src/main.ts',
          config: 'vite.main.config.ts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.ts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.ts',
        },
      ],
    }),
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;