import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.sakakibara.artfreeguide',
  appName: 'ArtFreeGuide',
  webDir: 'www',
  server: {
    url: 'https://art-free-guide-staging.taira-sakakibara.workers.dev',
    cleartext: false,
  },
};

export default config;
