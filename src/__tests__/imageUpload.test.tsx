// src/__tests__/ImageUpload.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import ImageUpload from '../ui-components/ImageUpload';
import * as UploadModule from '../ui-components/ImageUpload';
import * as LoggerModule from '../utils/Logger';
import * as msal from '@azure/msal-react';

// Mock MSAL to avoid real auth calls
const msalStub: any = { instance: { acquireTokenSilent: jest.fn().mockResolvedValue({ accessToken: 'mock' }) }, accounts: [] };
jest.mock('@azure/msal-react', () => ({
  useMsal: () => msalStub,
  useAccount: () => msalStub.accounts[0] || null
}));

describe('ImageUpload component (unit)', () => {
  beforeEach(() => {
    // default fetch returns a safe JSON with value: [] and id when used in tests
    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : ((input as any)?.url ?? '');
      console.log('[default fetch] ' + url);
      return Promise.resolve({ ok: true, json: async () => ({ id: 'site', value: [] }) });
    });
    // Mock heavy DOM/canvas-based image ops
    jest.spyOn(UploadModule, 'resizeImage').mockResolvedValue('data:image/png;base64,abc');
    jest.spyOn(UploadModule, 'encodeFilesToBase64').mockResolvedValue(['data:image/png;base64,abc']);
  });

  afterEach(() => {
    jest.resetAllMocks();
    // restore navigator
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
  });

  test('Offline save invokes onSaveOffline with selected subfolder and files', async () => {
    // Emulate offline state
    Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });

    const onSaveOffline = jest.fn().mockResolvedValue(undefined);
    const team = { id: 't1', displayName: 'Team A' };
    const channel = { id: 'c1', displayName: 'General' };

    // Mock fetch before mounting so the initial useEffect can run safely
    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : ((input as any)?.url ?? '');
      // debug logging - temporarily print URL to diagnose failing fetch that returns no value
      console.debug(`[test fetch] ${url}`);
      if (url.includes('/sites') && url.includes('/root')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'site' }) });
      }
      if (url.includes('/children')) {
        return Promise.resolve({ ok: true, json: async () => ({ value: [] }) });
      }
      // For any other calls, return ok with id and empty value to avoid runtime errors
      return Promise.resolve({ ok: true, json: async () => ({ id: 'site', value: [] }) });
    });

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

  test('selecting and removing files updates UI accordingly', async () => {
    const onSaveOffline = jest.fn().mockResolvedValue(undefined);
    const team = { id: 't1', displayName: 'Team A' };
    const channel = { id: 'c1', displayName: 'General' };

    render(
      <ImageUpload
        team={team}
        channel={channel}
        customText=""
        onUploadSuccess={() => {}}
        onCustomTextChange={() => {}}
        onSaveOffline={onSaveOffline}
        cachedSubFolders={[]}
      />
    );

    // Upload a file
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['abc'], 'image2.png', { type: 'image/png' });
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByText(/image2.png/i)).toBeInTheDocument());

    // Ensure button shows selected count
    expect(screen.getByText(/1 Datei\(en\) ausgewählt/)).toBeInTheDocument();

    // Click the remove icon for the first card
    const removeButtons = screen.getAllByTitle('Entfernen');
    expect(removeButtons.length).toBeGreaterThan(0);
    await userEvent.click(removeButtons[0]);
    // Now the file should be removed; button text resets
    await waitFor(() => expect(screen.getByText(/Dateien auswählen/i)).toBeInTheDocument());
  });

  test('handleUpload online calls onSaveOffline when onSaveOffline provided', async () => {
    // Provide account via msal stub
    msalStub.accounts = [{}];
    msalStub.instance.acquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: 'mock' });

    const onSaveOffline = jest.fn().mockResolvedValue(undefined);
    const team = { id: 't1', displayName: 'Team A' };
    const channel = { id: 'c1', displayName: 'General' };
    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : ((input as any)?.url ?? '');
      if (url.includes('/sites') && url.includes('/root')) {
        return Promise.resolve({ ok: true, json: async () => ({ id: 'siteId' }) });
      }
      if (url.includes('/children')) {
        return Promise.resolve({ ok: true, json: async () => ({ value: [] }) });
      }
      // Return some generic OK response with both id and value to avoid failures
      return Promise.resolve({ ok: true, json: async () => ({ id: 'site', value: [] }) });
    });

    render(
      <ImageUpload
        team={team}
        channel={channel}
        customText="online text"
        onUploadSuccess={() => {}}
        onCustomTextChange={() => {}}
        onSaveOffline={onSaveOffline}
        cachedSubFolders={[]}
      />
    );

    // Attach a file
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['abc'], 'image3.png', { type: 'image/png' });
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByText(/image3.png/i)).toBeInTheDocument());

    // Click Upload button (should be 'Datei(en) hochladen' offline = false)
    const uploadBtn = screen.getByRole('button', { name: /Datei\(en\) hochladen/i });
    expect(uploadBtn).toBeInTheDocument();
    await userEvent.click(uploadBtn);

    await waitFor(() => expect(onSaveOffline).toHaveBeenCalled());
  });
});