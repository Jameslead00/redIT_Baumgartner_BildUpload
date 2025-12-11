// src/__tests__/rtl-import.test.ts
import { render } from '@testing-library/react';

test('RTL import sanity check', () => {
  expect(typeof render).toBe('function');
});