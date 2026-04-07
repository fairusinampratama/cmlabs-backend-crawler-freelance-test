/**
 * Enhanced Crawler with Resource Downloading
 * Complete website archiving with CSS, JS, and images
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const beautify = require('js-beautify').html;

const ResourceDetector = require('./resource-detector');
const ResourceDownloader = require('./resource-downloader');
const HTMLRewriter = require('./html-rewriter');

const OUTPUT_DIR = path.join(__dirname, 'output');

// Target URLs with their names for folder creation
const targets = [
  { url: 'https://cmlabs.co', name: 'cmlabs' },
  { url: 'https://sequence.day', name: 'sequence' },
  { url: 'https://react.dev', name: 'react' }
];

/**
 * Ensure output directory exists
 */
function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Get site output directory
 */
function getSiteOutputDir(siteName) {
  const dir = path.join(OUTPUT_DIR, siteName);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

/**
 * Crawl a single URL and return HTML
 */
async function crawlUrl(browser, url) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate and wait for full load
    await page.goto(url, { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    // Wait additional time for any lazy-loaded content
    await page.waitForTimeout(3000);
    
    // Scroll to trigger lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(1000);
    
    // Get the fully rendered HTML
    const html = await page.content();
    
    await context.close();
    return html;
    
  } catch (error) {
    console.error(`❌ Error crawling ${url}: ${error.message}`);
    await context.close();
    return null;
  }
}

/**
 * Process a single website: crawl, download resources, rewrite HTML
 */
async function processWebsite(browser, target) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🌐 Processing: ${target.url}`);
  console.log('='.repeat(70));
  
  const siteOutputDir = getSiteOutputDir(target.name);
  
  // Step 1: Crawl the page
  console.log('\n📡 Step 1: Crawling page...');
  const html = await crawlUrl(browser, target.url);
  
  if (!html) {
    console.log('❌ Failed to crawl page');
    return { success: false, error: 'Crawl failed' };
  }
  
  console.log(`✅ Crawled ${html.length.toLocaleString()} bytes`);
  
  // Step 2: Detect resources
  console.log('\n🔍 Step 2: Detecting resources...');
  const detector = new ResourceDetector();
  const resources = detector.detect(html, target.url);
  
  console.log(`📊 Found ${resources.summary.total} resources:`);
  console.log(`   CSS: ${resources.summary.css}`);
  console.log(`   JS: ${resources.summary.js}`);
  console.log(`   Images: ${resources.summary.images}`);
  console.log(`   Fonts: ${resources.summary.fonts}`);
  console.log(`   Other: ${resources.summary.other}`);
  
  // Step 3: Download resources
  console.log('\n📥 Step 3: Downloading resources...');
  const downloader = new ResourceDownloader(siteOutputDir);
  const downloadResult = await downloader.downloadAll(resources);
  
  console.log(`✅ Downloaded: ${downloadResult.downloaded}`);
  console.log(`❌ Failed: ${downloadResult.failed}`);
  console.log(`⏭️  Skipped: ${downloadResult.skipped}`);
  console.log(`💾 Total size: ${downloader.formatBytes(downloader.getTotalSize())}`);
  
  // Step 4: Rewrite HTML with local paths
  console.log('\n🔄 Step 4: Rewriting HTML...');
  const rewriter = new HTMLRewriter(siteOutputDir);
  rewriter.loadUrlMap(downloadResult.results);
  const rewrittenHtml = rewriter.rewrite(html, target.url);
  
  // Step 5: Pretty print
  const prettyHtml = beautify(rewrittenHtml, {
    indent_size: 2,
    wrap_line_length: 120,
    preserve_newlines: true,
    max_preserve_newlines: 2
  });
  
  // Step 6: Save final HTML
  const outputPath = path.join(siteOutputDir, 'index.html');
  fs.writeFileSync(outputPath, prettyHtml, 'utf-8');
  
  console.log(`\n✅ Saved to: ${outputPath}`);
  
  // Also save original for comparison
  const originalPath = path.join(siteOutputDir, 'original.html');
  fs.writeFileSync(originalPath, html, 'utf-8');
  
  return {
    success: true,
    htmlLength: html.length,
    resources: resources.summary,
    downloaded: downloadResult.downloaded,
    failed: downloadResult.failed,
    totalSize: downloader.getTotalSize(),
    outputPath
  };
}

/**
 * Main function
 */
async function main() {
  console.log('='.repeat(70));
  console.log('🚀 ENHANCED CRAWLER WITH RESOURCE DOWNLOADING');
  console.log('='.repeat(70));
  console.log('Features:');
  console.log('  • Full page rendering with JavaScript');
  console.log('  • CSS/JS/Image downloading');
  console.log('  • URL rewriting for offline viewing');
  console.log('  • Organized folder structure');
  
  ensureOutputDir();
  
  let browser = null;
  const results = [];
  
  try {
    // Launch browser
    console.log('\n🖥️  Launching browser...');
    browser = await chromium.launch({ headless: true });
    console.log('✅ Browser ready\n');
    
    // Process each target
    for (const target of targets) {
      const result = await processWebsite(browser, target);
      results.push({ target: target.url, name: target.name, ...result });
    }
    
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    console.error(error.stack);
  } finally {
    if (browser) {
      console.log('\n🔒 Closing browser...');
      await browser.close();
    }
  }
  
  // Summary
  console.log(`\n${'='.repeat(70)}`);
  console.log('📊 FINAL SUMMARY');
  console.log('='.repeat(70));
  
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log(`\nTotal: ${results.length} sites`);
  console.log(`✅ Successful: ${successful}`);
  console.log(`❌ Failed: ${failed}`);
  
  console.log('\n📁 Output folders:');
  for (const result of results) {
    if (result.success) {
      const size = (result.totalSize / 1024 / 1024).toFixed(2);
      console.log(`   ✅ ${result.name}/`);
      console.log(`      index.html (${(result.htmlLength / 1024).toFixed(1)} KB)`);
      console.log(`      assets/ (${size} MB, ${result.downloaded} files)`);
    } else {
      console.log(`   ❌ ${result.name}/ - ${result.error || 'Unknown error'}`);
    }
  }
  
  console.log(`\n💡 To view locally, run:`);
  console.log(`   npx serve output/{sitename}`);
  console.log(`   or open output/{sitename}/index.html in browser`);
  console.log('='.repeat(70));
}

// Run if executed directly
if (require.main === module) {
  main();
}

// Export for use as module
module.exports = { crawlUrl, processWebsite, main };
