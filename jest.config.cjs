// jest.config.cjs
module.exports = {
  preset: 'ts-jest',
  testEnvironment: '<rootDir>/jest-environment-jsdom-custom.cjs',
  testEnvironmentOptions: {
    html: '<!DOCTYPE html>',
    userAgent: 'node'
  },
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.ts'],
  testMatch: [
    '<rootDir>/src/**/?(*.)+(spec|test).[jt]s?(x)',
    '<rootDir>/src/**/__tests__/**/*.[jt]s?(x)'
  ],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest'
  },
  moduleNameMapper: {
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy'
  },
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/index.tsx',
    '!src/serviceWorkerRegistration.ts'
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node']
};