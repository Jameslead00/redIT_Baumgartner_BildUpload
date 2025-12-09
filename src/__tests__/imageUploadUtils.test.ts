// src/__tests__/imageUploadUtils.test.ts
import { getFolderPath, checkFolderExists, createFolder, uploadSmallFile, uploadLargeFile } from '../ui-components/ImageUpload';

describe('ImageUpload utils', () => {
  beforeEach(() => {
    (global as any).fetch = jest.fn();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  test('getFolderPath builds correct path', () => {
    expect(getFolderPath('General')).toBe('General/Bilder');
    expect(getFolderPath('Marketing Kanal')).toBe('Marketing Kanal/Bilder');
  });

  test('checkFolderExists returns based on fetch.ok', async () => {
    (global as any).fetch.mockResolvedValueOnce({ ok: true });
    const okRes = await checkFolderExists('token', 'siteid', 'General/Bilder');
    expect(okRes).toBe(true);

    (global as any).fetch.mockResolvedValueOnce({ ok: false });
    const nokRes = await checkFolderExists('token', 'siteid', 'General/Bilder');
    expect(nokRes).toBe(false);
  });

  test('createFolder POSTs to the parent path and resolves on ok', async () => {
    (global as any).fetch.mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({}) });

    await expect(createFolder('token', 'site-id', 'General/Bilder/Unterordner')).resolves.toBeUndefined();

    // Validate the call url (parent path)
    const calledUrl = (global as any).fetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain('/drive/root:/General/Bilder:/children');
  });

  test('createFolder rejects when API returns non-ok', async () => {
    (global as any).fetch.mockResolvedValueOnce({ ok: false });
    await expect(createFolder('token', 'site-id', 'General/Bilder/Unterordner')).rejects.toThrow();
  });

  test('uploadSmallFile PUTs file and returns webUrl', async () => {
    const webUrl = 'https://weburl';
    (global as any).fetch
      .mockResolvedValueOnce({ ok: true }) // PUT content
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ webUrl }) }); // GET /{file}

    const file = new File(['a'], 'test.jpg', { type: 'image/jpeg' });
    const url = await uploadSmallFile('token', 'site', file, 'General/Bilder');
    expect(url).toBe(webUrl);
    // Check the upload PUT content endpoint
    const callUrl1 = (global as any).fetch.mock.calls[0][0];
    expect(callUrl1).toContain('/drive/root:/General/Bilder/test.jpg:/content');
  });

  test('uploadLargeFile creates session, uploads and returns webUrl', async () => {
    const uploadUrl = 'https://upload.session';
    const webUrl = 'https://weburl.large';
    // Session creation -> upload -> final GET
    (global as any).fetch
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ uploadUrl }) }) // createUploadSession
      .mockResolvedValueOnce({ ok: true }) // PUT to uploadUrl (chunks)
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ webUrl }) }); // final GET

    const file = new File([new ArrayBuffer(1000)], 'big.jpg', { type: 'image/jpeg' });
    const url = await uploadLargeFile('token', 'site', file, 'General/Bilder');
    expect(url).toBe(webUrl);
    expect((global as any).fetch.mock.calls[0][0]).toContain('/createUploadSession');
  });
});