/**
 * Utility to resolve API Base URLs dynamically.
 * Handles the difference between Web environment and Capacitor APK environment.
 */
export const getApiUrl = (p: string): string => {
  if (!p) return p;
  if (p.startsWith('http://') || p.startsWith('https://')) return p;

  const savedServer = localStorage.getItem('custom_api_server_url');
  if (savedServer && savedServer.trim() !== '') {
    const base = savedServer.trim().endsWith('/') ? savedServer.trim().slice(0, -1) : savedServer.trim();
    return `${base}${p.startsWith('/') ? p : '/' + p}`;
  }

  const origin = window.location.origin;
  const isCapacitor = origin.includes('localhost') || origin.startsWith('capacitor://');
  const isFirebaseHosting = origin.includes('firebaseapp.com') || origin.includes('web.app');

  if (isCapacitor || isFirebaseHosting) {
    // Current Cloud Run service URL
    const defaultCloudRun = 'https://ais-pre-giowxyd3cmhxrqfffqj4ki-915540977151.asia-southeast1.run.app';
    return `${defaultCloudRun}${p.startsWith('/') ? p : '/' + p}`;
  }

  return `${origin}${p.startsWith('/') ? p : '/' + p}`;
};
