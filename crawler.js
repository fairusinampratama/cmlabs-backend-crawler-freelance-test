const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Target URLs and their corresponding output filenames
const targets = [
  { url: 'https://cmlabs.co', filename: 'cmlabs.html' },
  { url: 'https://sequence.day', filename: 'sequence.html' },
  { url: 'https://react.dev', filename: 'free_choice.html' }
];

// User-Agent string to avoid basic bot detection
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Output directory
const OUTPUT_DIR = path.join(__dirname, 'output');

async function crawlPage(browser, target) {
  const { url, filename } = target;
  
  console.log(`Crawling: ${url}`);
  
  const context = await browser.newContext({
    userAgent: USER_AGENT
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate with networkidle wait condition and 60s timeout
    await page.goto(url, {
      waitUntil: 'networkidle',
      timeout: 60000
    });
    
    // Extract the fully rendered HTML
    const html = await page.content();
    
    // Write to output file
    const outputPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, html, 'utf-8');
    
    console.log(`✓ Successfully saved: ${filename} (${html.length} bytes)`);
    
  } catch (error) {
    console.error(`✗ Failed to crawl ${url}: ${error.message}`);
  } finally {
    // Always close the context to prevent memory leaks
    await context.close();
  }
}

async function main() {
  let browser = null;
  
  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      console.log(`Created output directory: ${OUTPUT_DIR}`);
    }
    
    // Launch browser in headless mode
    browser = await chromium.launch({
      headless: true
    });
    
    console.log('Browser launched in headless mode\n');
    
    // Crawl each target URL
    for (const target of targets) {
      await crawlPage(browser, target);
    }
    
    console.log('\n✓ Crawling complete!');
    
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    // Always close the browser
    if (browser) {
      await browser.close();
      console.log('Browser closed.');
    }
  }
}

// Run the crawler
main();
