/**
 * Jest Configuration for E2E Similarity Tests
 */

module.exports = {
  // Test environment
  testEnvironment: 'node',

  // Test match patterns
  testMatch: [
    '**/test/**/*.test.js'
  ],

  // Module paths
  moduleDirectories: [
    'node_modules',
    '<rootDir>'
  ],

  // Test timeout (2 minutes per test for crawling/screenshots)
  testTimeout: 120000,

  // Verbose output
  verbose: true,

  // Collect coverage from
  collectCoverageFrom: [
    'crawler.js',
    'src/**/*.js'
  ],

  // Coverage directory
  coverageDirectory: 'coverage',

  // Setup files
  setupFilesAfterEnv: [],

  // Transform
  transform: {},

  // Globals
  globals: {},

  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'reports',
        outputName: 'junit.xml'
      }
    ]
  ],

  // Test path ignore patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/output/',
    '/coverage/'
  ]
};
