module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>'],
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    '../../packages/*/src/**/*.ts',
    '!**/*.d.ts',
    '!**/__tests__/**'
  ],
  moduleNameMapper: {
    '^@x402-agent-gateway/server$': '<rootDir>/../../packages/server/src/index.ts',
    '^@x402-agent-gateway/client$': '<rootDir>/../../packages/client/src/index.ts',
    '^openai$': '<rootDir>/__mocks__/openai.ts'
  },
  testTimeout: 90000,
  // setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  maxWorkers: 1,
  forceExit: true
};
