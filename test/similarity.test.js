/**
 * Similarity E2E Tests
 * Tests visual similarity between crawled output and live websites
 * 
 * Targets:
 * - cmlabs.co → output/cmlabs.html
 * - sequence.day → output/sequence.html
 * - react.dev → output/free_choice.html
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { PNG } = require('pngjs');
const { VisualComparator } = require('./utils/visual-comparator');
const { TestServer } = require('./utils/test-server');
const { TARGETS } = require('./capture-baselines');

// Test configuration
const CONFIG = {
  thresholds: {
    cmlabs: 90,      // Goal: 90%
    sequence: 90,    // Goal: 90%
    reactdev: 90     // Goal: 90%
  },
  viewport: { width: 1280, height: 720 },
  outputDir: path.join(__dirname, '..', 'output'),
  baselineDir: path.join(__dirname, 'baselines'),
  crawledDir: path.join(__dirname, 'crawled'),
  diffDir: path.join(__dirname, 'diffs'),
  useHttpServer: true  // Enable HTTP server for crawled HTML
};

describe('Crawler Similarity Tests', () => {
  let browser;
  let context;
  let comparator;
  let testServer;
  let serverPort;

  beforeAll(async () => {
    // Start HTTP server for serving crawled HTML
    if (CONFIG.useHttpServer) {
      testServer = new TestServer({ port: 8888 });
      serverPort = await testServer.start();
      await testServer.waitForReady();
      console.log(`\n🚀 Test server started on port ${serverPort}`);
    }

    browser = await chromium.launch({
      headless: true,
      args: ['--disable-web-security']
    });
    context = await browser.newContext({ viewport: CONFIG.viewport });
    comparator = new VisualComparator({ threshold: 0.1 });
  });

  afterAll(async () => {
    await context.close();
    await browser.close();

    // Stop HTTP server
    if (testServer) {
      await testServer.stop();
    }
  });

  // Test each target
  for (const target of TARGETS) {
    test(`${target.name} - visual similarity`, async () => {
      const threshold = CONFIG.thresholds[target.name] || 90;

      // Define paths
      const htmlFile = target.name === 'reactdev'
        ? 'free_choice.html'
        : `${target.name}.html`;
      const htmlPath = path.join(CONFIG.outputDir, htmlFile);
      const baselinePath = path.join(CONFIG.baselineDir, target.filename);
      const crawledScreenshotPath = path.join(CONFIG.crawledDir, target.filename);
      const diffPath = path.join(CONFIG.diffDir, `${target.name}_diff.png`);

      // Verify HTML exists
      if (!fs.existsSync(htmlPath)) {
        throw new Error(`Crawled HTML not found: ${htmlPath}\nRun: npm run crawl`);
      }

      // Verify baseline exists
      if (!fs.existsSync(baselinePath)) {
        throw new Error(
          `Baseline not found: ${baselinePath}\nRun: node test/capture-baselines.js`
        );
      }

      // Read baseline strictly to force the exact same dimension for screenshot
      const baselineData = fs.readFileSync(baselinePath);
      const baselinePng = PNG.sync.read(baselineData);
      const exactBaselineHeight = baselinePng.height;

      // Determine URL for crawled HTML (HTTP server or file://)
      const crawledUrl = CONFIG.useHttpServer && testServer
        ? testServer.getUrl(htmlFile)
        : htmlPath;

      console.log(`\n   📸 Capturing: ${target.name}`);
      console.log(`   📏 Exact Baseline Height to Enforce: ${exactBaselineHeight}`);

      // NEW: Create fresh context and page for each target to prevent interference
      const context = await browser.newContext({
        viewport: CONFIG.viewport,
        deviceScaleFactor: 1
      });
      const page = await context.newPage();

      try {
        await comparator.captureScreenshot(page, crawledUrl, crawledScreenshotPath, exactBaselineHeight);
      } finally {
        await context.close(); // Closes page as well
      }

      // Compare with baseline
      const result = await comparator.compare(
        baselinePath,
        crawledScreenshotPath,
        diffPath
      );

      // Log results
      console.log(`\n📊 ${target.name.toUpperCase()} Similarity Results:`);
      console.log(`   Similarity: ${result.similarity.toFixed(2)}%`);
      console.log(`   Threshold: ${threshold}%`);
      console.log(`   Dimensions: ${result.width}x${result.height}`);
      console.log(`   Diff Pixels: ${result.diffPixels.toLocaleString()}`);

      if (result.dimensionMismatch) {
        console.log(`   ⚠️  Dimension mismatch detected!`);
        console.log(`   Original Baseline: ${result.originalHeight?.baseline || 'N/A'}px`);
        console.log(`   Original Crawled: ${result.originalHeight?.crawled || 'N/A'}px`);
        console.log(`   Normalized to: ${result.height}px`);
      }

      // Assert similarity meets threshold
      expect(result.similarity).toBeGreaterThanOrEqual(threshold);
    }, 120000); // 2 minute timeout per test
  }
});

describe('Similarity Report Generation', () => {
  test('generate summary report', () => {
    const reportPath = path.join(CONFIG.diffDir, 'similarity-report.json');

    // This would be populated by the test results
    // For now, create a placeholder structure
    const report = {
      timestamp: new Date().toISOString(),
      targets: TARGETS.map(t => ({
        name: t.name,
        url: t.url,
        threshold: CONFIG.thresholds[t.name] || 90
      })),
      summary: 'Run tests to generate results'
    };

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📝 Report saved: ${reportPath}`);

    expect(fs.existsSync(reportPath)).toBe(true);
  });
});
