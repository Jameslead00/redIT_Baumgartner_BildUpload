import { getFolderPath, checkFolderExists, createFolder, uploadSmallFile, uploadLargeFile, resizeImage, encodeFilesToBase64 } from '../ui-components/ImageUpload';

describe('ImageUpload helper functions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).fetch = jest.fn();
  });

  // dataURLToBlob is internal (not exported) — test indirectly via other functions

  test('getFolderPath builds path', () => {
    expect(getFolderPath('General')).toBe('General/Bilder');
  });

  test('checkFolderExists returns true/false based on fetch', async () => {
    (global as any).fetch.mockResolvedValueOnce({ ok: true });
    expect(await checkFolderExists('token', 'site', 'path')).toBe(true);
    (global as any).fetch.mockResolvedValueOnce({ ok: false });
    expect(await checkFolderExists('token', 'site', 'path')).toBe(false);
  });

  test('createFolder posts to the createApi and throws on error', async () => {
    (global as any).fetch.mockResolvedValueOnce({ ok: false, status: 500 });
    await expect(createFolder('token', 'site', 'a/b')).rejects.toThrow();
    (global as any).fetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });
    await expect(createFolder('token', 'site', 'a/b')).resolves.toBeUndefined();
  });

  test('uploadSmallFile returns webUrl on success', async () => {
    const mockFile = new File([new ArrayBuffer(10)], 'pic.jpg', { type: 'image/jpeg' });
    // 1st call: PUT content -> ok
    (global as any).fetch
      .mockResolvedValueOnce({ ok: true }) // upload
      .mockResolvedValueOnce({ ok: true, json: async () => ({ webUrl: 'https://url' }) });

    const url = await uploadSmallFile('token', 'site', mockFile, 'path');
    expect(url).toBe('https://url');
  });

  test('uploadSmallFile throws on failed upload', async () => {
    const mockFile = new File([new ArrayBuffer(10)], 'pic.jpg', { type: 'image/jpeg' });
    (global as any).fetch.mockResolvedValueOnce({ ok: false, status: 400, text: async () => 'err' });
    await expect(uploadSmallFile('token', 'site', mockFile, 'path')).rejects.toThrow();
  });

  test('uploadLargeFile success with chunking', async () => {
    // Create a file bigger than chunk size
    const buffer = new ArrayBuffer(700000);
    const bigFile = new File([buffer], 'big.jpg', { type: 'image/jpeg' });

    // session creation
    (global as any).fetch
      .mockResolvedValueOnce({ ok: true, json: async () => ({ uploadUrl: 'https://upload' }) }) // createUploadSession
      .mockResolvedValueOnce({ ok: true }) // chunk 1
      .mockResolvedValueOnce({ ok: true }) // chunk 2
      .mockResolvedValueOnce({ ok: true }) // chunk 3
      .mockResolvedValueOnce({ ok: true, json: async () => ({ webUrl: 'https://weburl' }) }); // final

    const url = await uploadLargeFile('token', 'site', bigFile, 'path');
    expect(url).toBe('https://weburl');
  });

  test('resizeImage and encodeFilesToBase64 uses mocked Image/Canvas', async () => {
    // Mock Image behavior & canvas
    const realImage = (global as any).Image;
    class FakeImage {
      _src: string = '';
      onload: any = null;
      onerror: any = null;
      width = 200;
      height = 100;
      set src(v: string) {
        this._src = v;
        setTimeout(() => { if (this.onload) this.onload(); }, 0);
      }
      get src() { return this._src; }
    }
    (global as any).Image = FakeImage as any;
    // Mock URL.createObjectURL
    (global as any).URL.createObjectURL = jest.fn().mockReturnValue('blob:some-url');

    // Mock canvas toBlob and FileReader
    const canvasMock = {
      getContext: () => ({ drawImage: jest.fn() }),
      toBlob: (cb: any) => setTimeout(() => cb(new Blob(['a'], { type: 'image/jpeg' })), 0)
    } as any;
    const createElementOrig = document.createElement.bind(document);
    jest.spyOn(document, 'createElement').mockImplementation((tag: any) => {
      if (tag === 'canvas') return canvasMock;
      return createElementOrig(tag);
    });

    // Mock FileReader
    const frOrig = (global as any).FileReader;
    class MockReader {
      onload: any = null;
      onerror: any = null;
      readAsDataURL() { setTimeout(() => { if (this.onload) this.onload({ target: { result: 'data:image/jpeg;base64,abc' } }); }, 0); }
    }
    (global as any).FileReader = MockReader;

    const file = new File([new ArrayBuffer(10)], 'pic.jpg', { type: 'image/jpeg' });
    // Mock resizeImage used by encodeFilesToBase64
    const spy = jest.spyOn(require('../ui-components/ImageUpload'), 'resizeImage').mockResolvedValue('data:image/jpeg;base64,abc');
    const results = await encodeFilesToBase64([file as any]);
    expect(results[0]).toContain('data:image');

    // restore
    (global as any).Image = realImage;
    (global as any).FileReader = frOrig;
    (document.createElement as jest.Mock).mockRestore();
  });
});
