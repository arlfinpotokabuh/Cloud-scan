import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.dimension.cloud',
  appName: 'Dimension Cloud',
  webDir: 'dist',
  server: {
    hostname: 'causal-weft-v4jp1.firebaseapp.com',
    androidScheme: 'https'
  }
};

export default config;
