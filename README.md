# CMLabs Backend Crawler

Advanced web crawler with visual accuracy features for React, Vue, and Angular SPAs.

## Quick Start

```bash
# Install dependencies
npm install

# Run crawler
npm run crawl
```

## Project Structure

```
cmlabs-backend-crawler/
├── crawler.js              # Main crawler (v4.0)
├── package.json            # Package configuration
├── .gitignore             # Git ignore rules
├── README.md              # This file
├── jest.config.js         # Jest configuration
├── src/                   # Source libraries
│   └── lib/phases/        # Phase 1-5 modules
├── test/                  # E2E similarity tests
│   ├── baselines/         # Baseline screenshots
│   ├── crawled/           # Test output screenshots
│   ├── diffs/             # Visual diff images
│   ├── utils/             # Visual comparator
│   ├── similarity.test.js # Main test suite
│   └── capture-baselines.js # Baseline capture script
├── examples/              # Usage examples
├── output/                # Crawler output (cmlabs.html, etc.)
└── scripts/               # Utility scripts
```

## Features

- **Resource Inlining** - Embed CSS, images, fonts for offline viewing
- **Lazy Load Fixer** - Force lazy content to load
- **SPA Polyfills** - Make React/Vue/Angular render offline
- **API Interceptor** - Capture and mock API responses
- **Content Freezer** - Pause animations, carousels for consistent state

## Usage

```javascript
const { Crawler } = require('./crawler');

const crawler = new Crawler({
  outputDir: './output',
  headless: true,
  inlineResources: true,
  fixLazyLoading: true,
  spaPolyfills: true
});

await crawler.crawl(['https://example.com']);
await crawler.close();
```

## Similarity Testing

The crawler includes visual similarity E2E tests for three targets:
- **cmlabs.co** → `output/cmlabs.html`
- **sequence.day** → `output/sequence.html`
- **react.dev** → `output/free_choice.html`

### Test Thresholds
- cmlabs: 95% similarity
- sequence: 90% similarity
- reactdev: 85% similarity

### Running Similarity Tests

```bash
# Full workflow: crawl → capture baselines → test similarity
npm run e2e

# Or step by step:
npm run crawl                    # Crawl all targets
npm run baseline:capture         # Capture live site screenshots
npm run test:similarity          # Compare and test
```

### Test Output
- Baselines: `test/baselines/`
- Crawled screenshots: `test/crawled/`
- Diff images: `test/diffs/`
- Report: `test/diffs/similarity-report.json`

## All NPM Scripts

```bash
npm run crawl                    # Run the crawler
npm test                         # Run all tests
npm run test:similarity          # Run similarity E2E tests
npm run test:similarity:watch    # Watch mode for tests
npm run baseline:capture        # Capture baseline screenshots
npm run e2e                      # Full E2E workflow
npm run clean                    # Clean temp files
```

## License

ISC
