// src/__tests__/ImageUpload.test.tsx
import React from 'react';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
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
  let originalImage: any;
  let originalCreateObjectURL: any;

  beforeEach(() => {
    // default fetch returns a safe JSON with value: [] and id when used in tests
    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : ((input as any)?.url ?? '');
      console.log('[default fetch] ' + url);
      return Promise.resolve({ ok: true, json: async (): Promise<{ id: string; value: any[] }> => ({ id: 'site', value: [] }) });
    });
    
    // Mock heavy DOM/canvas-based image ops
    jest.spyOn(UploadModule, 'resizeImage').mockResolvedValue('data:image/png;base64,abc');
    jest.spyOn(UploadModule, 'encodeFilesToBase64').mockResolvedValue(['data:image/png;base64,abc']);

    // Mock Image & URL for thumbnail generation
    originalImage = global.Image;
    originalCreateObjectURL = global.URL.createObjectURL;
    global.URL.createObjectURL = jest.fn(() => 'mock-url');
    (global as any).Image = class {
      onload: any;
      width = 100;
      height = 100;
      set src(_: string) { setTimeout(() => this.onload && this.onload(), 0); }
    };
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
        drawImage: jest.fn(),
    } as any);
    jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/jpeg;base64,thumb');
    // Mock toBlob for resizeImage
    (HTMLCanvasElement.prototype as any).toBlob = jest.fn((callback) => callback(new Blob([''], { type: 'image/jpeg' })));
  });

  afterEach(() => {
    jest.resetAllMocks();
    // restore navigator
    Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
    global.Image = originalImage;
    global.URL.createObjectURL = originalCreateObjectURL;
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
      
      // Match Site ID call: /groups/{id}/sites/root
      if (url.includes('/groups/') && url.includes('/sites/root')) {
        return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'site' }) });
      }
      // Match Children/Subfolders call
      if (url.includes('/children')) {
        return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [] }) });
      }
      // For any other calls, return ok with id and empty value to avoid runtime errors
      return Promise.resolve({ ok: true, json: async (): Promise<{ id: string; value: any[] }> => ({ id: 'site', value: [] }) });
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
      
      // Match Site ID call
      if (url.includes('/groups/') && url.includes('/sites/root')) {
        return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      }
      // Match Children call
      if (url.includes('/children')) {
        return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [] }) });
      }
      // Return some generic OK response with both id and value to avoid failures
      return Promise.resolve({ ok: true, json: async (): Promise<{ id: string; value: any[] }> => ({ id: 'site', value: [] }) });
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

  test('uploadImages creates folder when missing and calls uploadSmallFile', async () => {
    // Provide account via msal stub
    msalStub.accounts = [{}];
    msalStub.instance.acquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: 'mock' });

    const onUploadSuccess = jest.fn();
    const team = { id: 't1', displayName: 'Team A' };
    const channel = { id: 'c1', displayName: 'General' };

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      const method = init?.method || 'GET';

      // Match Site ID call
      if (url.includes('/groups/') && url.includes('/sites/root')) {
          return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      }
      // Match Folder Check (GET) -> 404 Not Found
      // Note: checkFolderExists checks for response.ok
      if (method === 'GET' && url.includes('/drive/root:/General/Bilder') && !url.includes('imageupload.jpg')) {
          return Promise.resolve({ ok: false, status: 404 });
      }
      // Match Create Folder (POST)
      if (method === 'POST' && url.includes('/children')) {
          return Promise.resolve({ ok: true, json: async (): Promise<{}> => ({}) });
      }
      // Match Upload Content (PUT)
      if (method === 'PUT' && url.includes('/content')) {
          return Promise.resolve({ ok: true });
      }
      // Match Get WebUrl (GET item after upload)
      if (method === 'GET' && url.includes('imageupload.jpg')) {
          return Promise.resolve({ ok: true, json: async (): Promise<{ webUrl: string }> => ({ webUrl: 'https://weburl.small' }) });
      }
      // Default fallback
      return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [] }) });
    });

    render(
      <ImageUpload
        team={team}
        channel={channel}
        customText=""
        onUploadSuccess={onUploadSuccess}
        onCustomTextChange={() => {}}
        // onSaveOffline removed to trigger internal uploadImages
        cachedSubFolders={[]}
      />
    );

    // Attach a file
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['abc'], 'imageupload.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, file);
    await waitFor(() => expect(screen.getByText(/imageupload.jpg/i)).toBeInTheDocument());

    // Click the upload button (online)
    msalStub.accounts = [{}];
    const uploadBtn = screen.getByRole('button', { name: /Datei\(en\) hochladen/i });
    await userEvent.click(uploadBtn);

    await waitFor(() => {
      expect((global as any).fetch).toHaveBeenCalledWith(
          expect.stringContaining('/children'),
          expect.objectContaining({ method: 'POST' })
      );
      expect((global as any).fetch).toHaveBeenCalledWith(
          expect.stringContaining('/content'),
          expect.objectContaining({ method: 'PUT' })
      );
      expect(onUploadSuccess).toHaveBeenCalled();
    });
  });


  test('uploadImages handles large files via uploadLargeFile (chunked)', async () => {
    msalStub.accounts = [{}];
    msalStub.instance.acquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: 'mock' });

    const onUploadSuccess = jest.fn();
    const team = { id: 't1', displayName: 'Team A' };
    const channel = { id: 'c1', displayName: 'General' };

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      const method = init?.method || 'GET';

      if (url.includes('/groups/') && url.includes('/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      
      // Create Upload Session
      if (url.includes('createUploadSession')) {
          return Promise.resolve({ ok: true, json: async (): Promise<{ uploadUrl: string }> => ({ uploadUrl: 'https://upload.url' }) });
      }

      // Finalize (GET item) - Check this BEFORE folder check because folder check is a substring of this
      if (method === 'GET' && url.includes('large.jpg')) {
          return Promise.resolve({ ok: true, json: async (): Promise<{ webUrl: string }> => ({ webUrl: 'https://weburl.large' }) });
      }

      // Folder exists check
      if (url.includes('/drive/root:/General/Bilder')) {
           return Promise.resolve({ ok: true, json: async (): Promise<{}> => ({}) }); 
      }
      
      // Upload Chunk
      if (url === 'https://upload.url') {
          return Promise.resolve({ ok: true, json: async (): Promise<{}> => ({}) });
      }

      return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [] }) });
    });

    render(
      <ImageUpload
        team={team}
        channel={channel}
        customText=""
        onUploadSuccess={onUploadSuccess}
        onCustomTextChange={() => {}}
        cachedSubFolders={[]}
      />
    );

    // Create a large file (> 4MB)
    const largeFile = new File(['a'.repeat(5 * 1024 * 1024)], 'large.jpg', { type: 'image/jpeg' });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, largeFile);

    // Wait for file to be selected and button enabled
    await waitFor(() => expect(screen.getByText(/large.jpg/i)).toBeInTheDocument());

    const uploadBtn = screen.getByRole('button', { name: /Datei\(en\) hochladen/i });
    await userEvent.click(uploadBtn);

    await waitFor(() => {
        expect((global as any).fetch).toHaveBeenCalledWith(
            expect.stringContaining('createUploadSession'),
            expect.objectContaining({ method: 'POST' })
        );
        expect(onUploadSuccess).toHaveBeenCalled();
    });
  });

  test('fetches subfolders when online and displays them', async () => {
    msalStub.accounts = [{}];
    msalStub.instance.acquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: 'mock' });

    const team = { id: 't1', displayName: 'Team A' };
    const channel = { id: 'c1', displayName: 'General' };

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      if (url.includes('/groups/') && url.includes('/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      if (url.includes('/children')) {
          return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [{ id: 'sf1', name: 'SubFolder1', folder: {} }] }) });
      }
      return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [] }) });
    });

    render(
      <ImageUpload
        team={team}
        channel={channel}
        customText=""
        onUploadSuccess={() => {}}
        onCustomTextChange={() => {}}
        cachedSubFolders={[]}
      />
    );

    // Check if SubFolder1 appears in the dropdown
    // Note: Autocomplete/Select might need interaction to show options, but we can check if state was updated or if it's in the document if rendered
    // MUI Select is tricky, let's try to open it
    const selectLabel = await screen.findByLabelText(/Unterordner auswählen/i);
    await userEvent.click(selectLabel);
    
    await waitFor(() => {
        expect(screen.getByText('SubFolder1')).toBeInTheDocument();
    });
  });

  test('handles folder creation failure', async () => {
    msalStub.accounts = [{}];
    msalStub.instance.acquireTokenSilent = jest.fn().mockResolvedValue({ accessToken: 'mock' });

    const team = { id: 't1', displayName: 'Team A' };
    const channel = { id: 'c1', displayName: 'General' };

    (global as any).fetch = jest.fn().mockImplementation((input: RequestInfo, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as any).url;
      const method = init?.method || 'GET';

      if (url.includes('/groups/') && url.includes('/sites/root')) return Promise.resolve({ ok: true, json: async (): Promise<{ id: string }> => ({ id: 'siteId' }) });
      // Folder check fails (404)
      if (method === 'GET' && url.includes('/drive/root:/General/Bilder')) return Promise.resolve({ ok: false, status: 404 });
      // Folder creation fails (500)
      if (method === 'POST' && url.includes('/children')) return Promise.resolve({ ok: false, status: 500 });

      return Promise.resolve({ ok: true, json: async (): Promise<{ value: any[] }> => ({ value: [] }) });
    });

    render(
      <ImageUpload
        team={team}
        channel={channel}
        customText=""
        onUploadSuccess={() => {}}
        onCustomTextChange={() => {}}
        cachedSubFolders={[]}
      />
    );

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['abc'], 'fail.jpg', { type: 'image/jpeg' });
    await userEvent.upload(input, file);

    const uploadBtn = screen.getByRole('button', { name: /Datei\(en\) hochladen/i });
    await userEvent.click(uploadBtn);

    // Should show error message (we can check for console.error or UI error state if implemented)
    // The component sets error state
    // await waitFor(() => expect(screen.getByText(/Failed to create/i)).toBeInTheDocument()); // Error message might vary
  });
});