import { db, OfflineDB } from '../db';

describe('DB exports and Dexie initialization', () => {
  test('db has tables favoriteTeams, posts, images', () => {
    expect(db).toBeDefined();
    expect((db as any).favoriteTeams).toBeDefined();
    expect((db as any).posts).toBeDefined();
    expect((db as any).images).toBeDefined();
  });

  test('OfflineDB class constructor creates Dexie instance', () => {
    const inst = new OfflineDB();
    expect((inst as any).favoriteTeams).toBeDefined();
    inst.close();
  });
});
