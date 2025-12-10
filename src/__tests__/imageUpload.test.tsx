// src/__tests__/ImageUpload.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ImageUpload from '../ui-components/ImageUpload';
import * as UploadModule from '../ui-components/ImageUpload';

// Mock MSAL to avoid real auth calls
jest.mock('@azure/msal-react', () => ({
  useMsal: (): { instance: { acquireTokenSilent: jest.Mock }; accounts: any[] } => ({ 
    instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock' }) }, 
    accounts: [] 
  }),
  useAccount: (): null => null
}));

describe('ImageUpload component (unit)', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
    // Mock heavy DOM/canvas-based image ops
    jest.spyOn(UploadModule, 'resizeImage').mockResolvedValue('data:image/png;base64,abc');
    jest.spyOn(UploadModule, 'encodeFilesToBase64').mockResolvedValue(['data:image/png;base64,abc']);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('Offline save invokes onSaveOffline with selected subfolder and files', async () => {
    // Emulate offline state
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    const onSaveOffline = jest.fn().mockResolvedValue(undefined);
    const team = { id: 't1', displayName: 'Team A' };
    const channel = { id: 'c1', displayName: 'General' };

    render(
      <ImageUpload
        team={team}
        channel={channel}
        customText="Offline message"  // non-empty -> enables "Offline speichern" button while offline
        onUploadSuccess={() => {}}
        onCustomTextChange={() => {}}
        onSaveOffline={onSaveOffline}
        cachedSubFolders={[{ id: 'sf1', name: 'Folder1' }]}
        initialSelectedSubFolder="Folder1"  // Pre-select the subfolder for testing
      />
    );

    // Find the hidden file input and upload a file via userEvent
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input).toBeInTheDocument();

    const file = new File(['abc'], 'image.png', { type: 'image/png' });

    // userEvent.upload will simulate selecting a file and dispatch change event
    await userEvent.upload(input, file);

    // Wait for UI to render the file preview name
    await waitFor(() => {
      expect(screen.getByText(/image.png/i)).toBeInTheDocument();
    });

    // Wait for the combobox to show the selected subfolder
    await waitFor(() => {
      expect(screen.getByRole('combobox', { name: /Unterordner auswählen \(Optional\)/i })).toHaveTextContent('Folder1');
    });

    // Now the Offline button should be enabled because customText is non-empty
    const button = screen.getByRole('button', { name: /Offline speichern/i });
    expect(button).toBeInTheDocument();
    expect(button).not.toBeDisabled();
    await userEvent.click(button);

    // Assert onSaveOffline got called with (filesArray, 'Folder1', maybe onProgress)
    await waitFor(() => {
      expect(onSaveOffline).toHaveBeenCalled();
      const [filesArg, subfolderArg] = onSaveOffline.mock.calls[0];
      expect(Array.isArray(filesArg)).toBe(true);
      expect(subfolderArg).toBe('Folder1');
    });

    // Reset navigator.onLine state
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });
});