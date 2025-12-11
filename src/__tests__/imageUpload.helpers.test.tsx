import { getFolderPath, checkFolderExists, createFolder, uploadLargeFile, uploadSmallFile, encodeFilesToBase64 } from '../ui-components/ImageUpload';
import '@testing-library/jest-dom';

describe('ImageUpload helpers', () => {
  afterEach(() => {
    jest.resetAllMocks();
  });

  test('getFolderPath returns path', () => {
    expect(getFolderPath('General')).toBe('General/Bilder');
  });

  test('checkFolderExists returns true when ok', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
    const res = await checkFolderExists('token', 'site', 'General/Bilder');
    expect(res).toBe(true);
  });

  test('checkFolderExists returns false when not ok', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false });
    const res = await checkFolderExists('token', 'site', 'General/Bilder');
    expect(res).toBe(false);
  });

  test('createFolder posts to graph and resolves', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
    await expect(createFolder('t', 'site', 'General/Bilder')).resolves.toBeUndefined();
  });

  test('createFolder throws if not ok', async () => {
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false });
    await expect(createFolder('t', 'site', 'General/Bilder')).rejects.toThrow(/Failed to create/);
  });

  test('uploadSmallFile returns webUrl on success', async () => {
    const file = new File(['a'], 'img.png', { type: 'image/png' });
    // First return for PUT content
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ webUrl: 'https://weburl' }) });
    (global as any).fetch = fetchMock;
    const url = await uploadSmallFile('token', 'site', file, 'General/Bilder');
    expect(url).toBe('https://weburl');
  });

  test('uploadSmallFile throws if PUT fails', async () => {
    const file = new File(['a'], 'img.png', { type: 'image/png' });
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'error' });
    await expect(uploadSmallFile('token', 'site', file, 'General/Bilder')).rejects.toThrow(/Failed to upload/);
  });

  test('uploadLargeFile uploads and returns webUrl', async () => {
    const data = new Uint8Array(50000);
    const file = new File([data], 'big.png', { type: 'image/png' });

    // Sequence: createUploadSession, put chunk(s), final GET
    let call = 0;
    (global as any).fetch = jest.fn().mockImplementation((input: any) => {
      const url = typeof input === 'string' ? input : (input.url || '');
      if (url.endsWith('/createUploadSession')) {
        return Promise.resolve({ ok: true, json: async () => ({ uploadUrl: 'https://uploadsession' }) });
      }
      if (url.startsWith('https://uploadsession')) {
        // PUT chunk
        return Promise.resolve({ ok: true });
      }
      if (url.includes('/drive/root:') && !url.includes('/createUploadSession')) {
        return Promise.resolve({ ok: true, json: async () => ({ webUrl: 'https://weburl' }) });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const url = await uploadLargeFile('token', 'site', file, 'General/Bilder');
    expect(url).toBe('https://weburl');
  });

  test('uploadLargeFile throws if session creation fails', async () => {
    const file = new File([new Uint8Array(500000)], 'big.png', { type: 'image/png' });
    (global as any).fetch = jest.fn().mockImplementation((input: any) => {
      const url = typeof input === 'string' ? input : (input.url || '');
      if (url.endsWith('/createUploadSession')) {
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    await expect(uploadLargeFile('token', 'site', file, 'General/Bilder')).rejects.toThrow();
  });

  test('uploadLargeFile throws if chunk upload fails', async () => {
    const data = new Uint8Array(500000);
    const file = new File([data], 'big.png', { type: 'image/png' });
    (global as any).fetch = jest.fn().mockImplementation((input: any) => {
      const url = typeof input === 'string' ? input : (input.url || '');
      if (url.endsWith('/createUploadSession')) {
        return Promise.resolve({ ok: true, json: async () => ({ uploadUrl: 'https://uploadsession' }) });
      }
      if (url.startsWith('https://uploadsession')) {
        // Simulate a failed PUT for chunk
        return Promise.resolve({ ok: false });
      }
      return Promise.resolve({ ok: true, json: async () => ({ webUrl: 'https://weburl' }) });
    });
    await expect(uploadLargeFile('token', 'site', file, 'General/Bilder')).rejects.toThrow();
  });

  test('uploadLargeFile does multiple chunk PUT calls for large file', async () => {
    const size = 327680 * 3 + 100; // 3 chunks
    const data = new Uint8Array(size);
    const file = new File([data], 'bigger.png', { type: 'image/png' });
    let putCount = 0;
    (global as any).fetch = jest.fn().mockImplementation((input: any) => {
      const url = typeof input === 'string' ? input : (input.url || '');
      if (url.endsWith('/createUploadSession')) {
        return Promise.resolve({ ok: true, json: async () => ({ uploadUrl: 'https://uploadsession' }) });
      }
      if (url.startsWith('https://uploadsession')) {
        putCount++; return Promise.resolve({ ok: true });
      }
      if (url.includes('/drive/root:') && !url.includes('/createUploadSession')) return Promise.resolve({ ok: true, json: async () => ({ webUrl: 'https://weburl' }) });
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });
    const url = await uploadLargeFile('token', 'site', file, 'General/Bilder');
    expect(url).toBe('https://weburl');
    expect(putCount).toBeGreaterThanOrEqual(3);
  });

  test('encodeFilesToBase64 returns array same length as files', async () => {
    // spy resizeImage to return small base64 string
    jest.spyOn(require('../ui-components/ImageUpload'), 'resizeImage').mockResolvedValue('data:image/png;base64,abc');
    const f1 = new File(['a'], 'a.png', { type: 'image/png' });
    const f2 = new File(['b'], 'b.png', { type: 'image/png' });
    const res = await encodeFilesToBase64([f1, f2]);
    expect(Array.isArray(res)).toBeTruthy();
    expect(res.length).toBe(2);
  });

  test('encodeFilesToBase64 reduces quality until under threshold', async () => {
    // Spy on resizeImage to return long string for higher qualities, short for low qualities
    const resizeSpy = jest.spyOn(require('../ui-components/ImageUpload'), 'resizeImage').mockImplementation((file: File, w: number, h: number, quality: number) => {
      if (quality >= 0.4) {
        // simulate large base64
        return Promise.resolve('data:image/png;base64,' + 'A'.repeat(50000));
      }
      return Promise.resolve('data:image/png;base64,' + 'A'.repeat(100));
    });
    const f1 = new File(['a'], 'a.png', { type: 'image/png' });
    const res = await encodeFilesToBase64([f1]);
    expect(Array.isArray(res)).toBeTruthy();
    expect(res.length).toBe(1);
    expect(res[0].startsWith('data:image/png;base64,')).toBeTruthy();
    expect(resizeSpy).toHaveBeenCalled();
    resizeSpy.mockRestore();
  });
});
