// src/setupTests.ts
import '@testing-library/jest-dom';

// Ensure fetch available
if (!(global as any).fetch) {
  (global as any).fetch = jest.fn();
}

// Mock URL.createObjectURL
if (!(global as any).URL?.createObjectURL) {
  (global as any).URL = {
    ...(global as any).URL,
    createObjectURL: jest.fn(() => 'blob:mock'),
  };
}

// Simple Image Mock – triggers onload
class MockImage {
  onload?: () => void;
  onerror?: () => void;
  src = '';
  constructor() { setTimeout(() => this.onload?.(), 0); }
}
(global as any).Image = MockImage;

// Allow overriding navigator.onLine in tests (preserve existing navigator properties)
if (typeof window.navigator === 'object' && window.navigator !== null) {
  // Define a configurable/writable property `onLine` instead of replacing `navigator` completely
  Object.defineProperty(window.navigator, 'onLine', {
    value: true,
    configurable: true,
    writable: true,
  });
}