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

/**
 * Pretty-print HTML with proper indentation
 * @param {string} html - Raw HTML string
 * @returns {string} - Formatted HTML
 */
function formatHTML(html) {
  let formatted = '';
  let indent = 0;
  const tab = '  ';
  
  // Split by tags but keep the tags
  const tokens = html.split(/(<[^>]+>)/g).filter(token => token.trim() !== '');
  
  for (let token of tokens) {
    token = token.trim();
    if (!token) continue;
    
    // Check if it's a closing tag
    if (token.startsWith('</')) {
      indent = Math.max(0, indent - 1);
      formatted += tab.repeat(indent) + token + '\n';
    }
    // Self-closing tag or void element
    else if (token.match(/^<(br|hr|img|input|meta|link|area|base|col|embed|param|source|track|wbr)/i) || 
             token.match(/\/>$/)) {
      formatted += tab.repeat(indent) + token + '\n';
    }
    // Opening tag
    else if (token.startsWith('<') && !token.startsWith('<!--')) {
      formatted += tab.repeat(indent) + token + '\n';
      // Don't increase indent for certain tags that usually don't have children
      if (!token.match(/^<(script|style|pre|code)/i)) {
        indent++;
      }
    }
    // Text content or comment
    else {
      // Inline text if it's short
      if (token.length < 80 && !token.includes('\n')) {
        // Remove previous newline and append inline
        formatted = formatted.slice(0, -1) + token;
        formatted += '\n';
      } else {
        // Long text - wrap at reasonable length
        const lines = token.split('\n').map(line => line.trim()).filter(line => line);
        for (const line of lines) {
          if (line) {
            formatted += tab.repeat(indent) + line + '\n';
          }
        }
      }
    }
  }
  
  return formatted;
}

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
    
    // Format the HTML for readability
    const formattedHTML = formatHTML(html);
    
    // Write to output file
    const outputPath = path.join(OUTPUT_DIR, filename);
    fs.writeFileSync(outputPath, formattedHTML, 'utf-8');
    
    console.log(`✓ Successfully saved: ${filename} (${formattedHTML.length} bytes)`);
    
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
    
    // Crawl each target URL sequentially
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
