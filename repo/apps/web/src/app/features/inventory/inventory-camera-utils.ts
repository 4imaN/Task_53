export function detectCameraCapability(environment: {
  hasMediaDevices: boolean;
  hasGetUserMedia: boolean;
  hasBarcodeDetector: boolean;
}): 'supported' | 'unsupported' {
  return environment.hasMediaDevices && environment.hasGetUserMedia && environment.hasBarcodeDetector
    ? 'supported'
    : 'unsupported';
}
