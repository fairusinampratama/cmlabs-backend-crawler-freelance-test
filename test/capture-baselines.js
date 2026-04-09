/**
 * Baseline Capture Script
 * Captures screenshots of live websites for comparison
 * Run: node test/capture-baselines.js
 */

const { chromium } = require('playwright');
const path = require('path');
const { VisualComparator } = require('./utils/visual-comparator');

const TARGETS = [
  {
    name: 'cmlabs',
    url: 'https://cmlabs.co',
    filename: 'cmlabs.png'
  },
  {
    name: 'sequence',
    url: 'https://sequence.day',
    filename: 'sequence.png'
  },
  {
    name: 'reactdev',
    url: 'https://react.dev',
    filename: 'react_dev.png'
  }
];

async function captureBaselines() {
  console.log('📸 Capturing Baseline Screenshots\n');
  console.log('='.repeat(60));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 }
  });
  
  const comparator = new VisualComparator({ threshold: 0.1 });

  for (const target of TARGETS) {
    const page = await context.newPage();
    const outputPath = path.join(__dirname, 'baselines', target.filename);

    try {
      console.log(`\n🌐 Capturing: ${target.name}`);
      console.log(`   URL: ${target.url}`);

      // Use the improved capture method with height limit
      await comparator.captureBaseline(page, target.url, outputPath, target.maxHeight);

      // Get actual dimensions
      const dimensions = await page.evaluate(() => ({
        width: document.documentElement.scrollWidth,
        height: Math.min(document.documentElement.scrollHeight, 10000)
      }));

      console.log(`   ✅ Saved: ${target.filename}`);
      console.log(`   📐 Dimensions: ${dimensions.width}x${dimensions.height}`);

    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
    } finally {
      await page.close();
    }
  }

  await context.close();
  await browser.close();

  console.log('\n' + '='.repeat(60));
  console.log('✅ Baseline Capture Complete!\n');
  console.log('Baselines saved in: test/baselines/');
  console.log('\nNext steps:');
  console.log('  1. Crawl the targets: npm run crawl');
  console.log('  2. Run similarity tests: npm run test:similarity');
}

// Run if called directly
if (require.main === module) {
  captureBaselines().catch(console.error);
}

module.exports = { captureBaselines, TARGETS };
