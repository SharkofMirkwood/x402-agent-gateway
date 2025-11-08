module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: ['src/**/*.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  transformIgnorePatterns: [
    'node_modules/(?!(uuid|@solana|@noble|bigint-buffer|buffer-layout)/)'
  ],
  moduleNameMapper: {
    '^uuid$': 'uuid',
    '^uuid/(.*)$': 'uuid/$1'
  }
};
