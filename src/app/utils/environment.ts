/**
 * Environment detection utilities
 * Helps detect if running in Electron vs browser
 * Ready for future Electron integration
 */

export const isElectron = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  // Check for Electron-specific properties
  return !!(
    (window as any).electron ||
    (window as any).require ||
    navigator.userAgent.includes('Electron')
  );
};

export const isWeb = (): boolean => {
  return !isElectron();
};

/**
 * Get Electron API if available
 * Returns null if not in Electron
 */
export const getElectronAPI = (): any => {
  if (typeof window === 'undefined') return null;
  return (window as any).electron || null;
};

