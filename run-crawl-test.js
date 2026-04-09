/**
 * Run crawler on test targets
 */

const { Crawler } = require('./crawler');
const fs = require('fs');
const path = require('path');

const TARGETS = [
  { name: 'cmlabs', url: 'https://cmlabs.co', filename: 'cmlabs.html' },
  { name: 'sequence', url: 'https://sequence.day', filename: 'sequence.html' },
  { name: 'reactdev', url: 'https://react.dev', filename: 'free_choice.html' }
];

async function runCrawlTest() {
  console.log('🕷️ Starting Crawler Test\n');
  console.log('='.repeat(60));

  // Ensure output directory exists
  const outputDir = './output';
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const crawler = new Crawler({
    headless: true,
    timeout: 60000,
    postLoadWait: 5000,
    outputDir: outputDir,
    inlineResources: true,
    fixLazyLoading: true,
    spaPolyfills: true,
    interceptAPI: true,
    freezeContent: true
  });

  for (const target of TARGETS) {
    console.log(`\n🌐 Crawling: ${target.name}`);
    console.log(`   URL: ${target.url}`);

    try {
      const result = await crawler.crawl(target.url);
      
      // Rename the file to expected format
      const actualFilename = path.basename(result.results[0].filePath);
      const expectedPath = path.join(outputDir, target.filename);
      const actualPath = path.join(outputDir, actualFilename);
      
      if (actualPath !== expectedPath && fs.existsSync(actualPath)) {
        fs.renameSync(actualPath, expectedPath);
        console.log(`   ✅ Saved: ${target.filename}`);
      } else {
        console.log(`   ✅ File exists: ${target.filename}`);
      }
    } catch (error) {
      console.error(`   ❌ Failed: ${error.message}`);
    }
  }

  await crawler.close();

  console.log('\n' + '='.repeat(60));
  console.log('✅ Crawl Complete!\n');
  console.log('Files saved in: output/');
}

if (require.main === module) {
  runCrawlTest().catch(console.error);
}

module.exports = { runCrawlTest };
