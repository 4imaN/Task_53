import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCameraCapability } from '../../src/app/features/inventory/inventory-camera-utils.ts';

test('detectCameraCapability returns unsupported without detector', () => {
  assert.equal(
    detectCameraCapability({
      hasMediaDevices: true,
      hasGetUserMedia: true,
      hasBarcodeDetector: false
    }),
    'unsupported'
  );
});

test('detectCameraCapability returns supported when browser exposes required APIs', () => {
  assert.equal(
    detectCameraCapability({
      hasMediaDevices: true,
      hasGetUserMedia: true,
      hasBarcodeDetector: true
    }),
    'supported'
  );
});
