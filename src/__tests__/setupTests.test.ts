test('preserves the URL constructor and provides createObjectURL', () => {
  expect(new URL('/path', 'http://localhost').href).toBe('http://localhost/path');
  expect(typeof URL.createObjectURL).toBe('function');
});

test('provides a UTF-8 TextEncoder', () => {
  expect(Array.from(new TextEncoder().encode('Grüße'))).toEqual([
    71, 114, 195, 188, 195, 159, 101,
  ]);
});
