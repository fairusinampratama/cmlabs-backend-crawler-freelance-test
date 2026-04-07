const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');

// Target URLs and their output files
const targets = [
  { url: 'https://cmlabs.co', filename: 'cmlabs.html' },
  { url: 'https://sequence.day', filename: 'sequence.html' },
  { url: 'https://react.dev', filename: 'free_choice.html' }
];

/**
 * Load HTML from file
 */
function loadOutputHTML(filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return null;
  }
  return fs.readFileSync(filepath, 'utf-8');
}

/**
 * Extract visible text from HTML (simplified)
 */
function extractVisibleText(html) {
  // Remove script and style tags with their content
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  
  // Extract text between tags
  const text = cleaned
    .replace(/<[^>]+>/g, ' ')  // Replace tags with spaces
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim();
  
  return text;
}

/**
 * Extract specific tag information
 */
function extractTagInfo(html) {
  const info = {
    title: null,
    description: null,
    h1Count: 0,
    h1Texts: [],
    h2Count: 0,
    imageCount: 0,
    linkCount: 0,
    scriptCount: 0,
    metaTags: [],
    hasBody: false,
    bodyClass: null,
    hasMainContent: false
  };
  
  // Extract title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) info.title = titleMatch[1].trim();
  
  // Extract description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) ||
                    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  if (descMatch) info.description = descMatch[1].trim();
  
  // Count headings
  info.h1Count = (html.match(/<h1/gi) || []).length;
  info.h2Count = (html.match(/<h2/gi) || []).length;
  
  // Extract H1 text
  const h1Matches = html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  for (const match of h1Matches) {
    const text = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) info.h1Texts.push(text);
  }
  
  // Count other elements
  info.imageCount = (html.match(/<img/gi) || []).length;
  info.linkCount = (html.match(/<a\s/gi) || []).length;
  info.scriptCount = (html.match(/<script/gi) || []).length;
  
  // Check for body
  info.hasBody = /<body/i.test(html);
  const bodyClassMatch = html.match(/<body[^>]*class=["']([^"']*)/i);
  if (bodyClassMatch) info.bodyClass = bodyClassMatch[1];
  
  // Check for main content
  info.hasMainContent = /<(main|article|section|div[^>]*id=["']main)/i.test(html);
  
  // Extract meta tags
  const metaMatches = html.matchAll(/<meta[^>]*>/gi);
  for (const match of metaMatches) {
    info.metaTags.push(match[0]);
  }
  
  return info;
}

/**
 * Compare two HTML content info objects
 */
function compareInfo(crawled, live, url) {
  const differences = [];
  const similarities = [];
  
  // Title comparison
  if (crawled.title && live.title) {
    if (crawled.title === live.title) {
      similarities.push(`✅ Title matches: "${crawled.title.substring(0, 50)}"`);
    } else {
      differences.push(`❌ Title mismatch:\n   Crawled: "${crawled.title.substring(0, 50)}"\n   Live:    "${live.title.substring(0, 50)}"`);
    }
  } else if (live.title && !crawled.title) {
    differences.push(`❌ Missing title in crawled output`);
  }
  
  // Description comparison
  if (crawled.description && live.description) {
    if (crawled.description === live.description) {
      similarities.push(`✅ Description matches`);
    } else {
      differences.push(`❌ Description mismatch:\n   Crawled: "${crawled.description.substring(0, 60)}..."\n   Live:    "${live.description.substring(0, 60)}..."`);
    }
  }
  
  // H1 count
  if (crawled.h1Count === live.h1Count) {
    similarities.push(`✅ H1 count matches: ${crawled.h1Count}`);
  } else {
    differences.push(`❌ H1 count mismatch: Crawled=${crawled.h1Count}, Live=${live.h1Count}`);
  }
  
  // H1 text comparison
  if (crawled.h1Texts.length > 0 && live.h1Texts.length > 0) {
    const matches = crawled.h1Texts.filter(ct => 
      live.h1Texts.some(lt => lt.includes(ct) || ct.includes(lt))
    ).length;
    if (matches === crawled.h1Texts.length) {
      similarities.push(`✅ All H1 texts match`);
    } else {
      differences.push(`❌ H1 text mismatch:\n   Crawled: ${JSON.stringify(crawled.h1Texts)}\n   Live:    ${JSON.stringify(live.h1Texts)}`);
    }
  }
  
  // Image count (within 10% tolerance)
  const imageDiff = Math.abs(crawled.imageCount - live.imageCount);
  const imageTolerance = Math.ceil(live.imageCount * 0.1);
  if (imageDiff <= imageTolerance) {
    similarities.push(`✅ Image count within tolerance: ${crawled.imageCount} vs ${live.imageCount}`);
  } else {
    differences.push(`❌ Image count differs significantly: Crawled=${crawled.imageCount}, Live=${live.imageCount}`);
  }
  
  // Link count (within 10% tolerance)
  const linkDiff = Math.abs(crawled.linkCount - live.linkCount);
  const linkTolerance = Math.ceil(live.linkCount * 0.1);
  if (linkDiff <= linkTolerance) {
    similarities.push(`✅ Link count within tolerance: ${crawled.linkCount} vs ${live.linkCount}`);
  } else {
    differences.push(`❌ Link count differs significantly: Crawled=${crawled.linkCount}, Live=${live.linkCount}`);
  }
  
  // Body class
  if (crawled.bodyClass && live.bodyClass) {
    if (crawled.bodyClass === live.bodyClass) {
      similarities.push(`✅ Body class matches`);
    } else {
      differences.push(`⚠️  Body class differs:\n   Crawled: "${crawled.bodyClass}"\n   Live:    "${live.bodyClass}"`);
    }
  }
  
  // Main content check
  if (crawled.hasMainContent) {
    similarities.push(`✅ Main content container found`);
  } else {
    differences.push(`❌ No main content container detected`);
  }
  
  return { differences, similarities, score: similarities.length / (similarities.length + differences.length) };
}

/**
 * Test a single URL
 */
async function testTarget(browser, target) {
  const { url, filename } = target;
  
  console.log(`\n${'='.repeat(70)}`);
  console.log(`Testing: ${url}`);
  console.log(`${'='.repeat(70)}`);
  
  // Load crawled output
  const crawledHTML = loadOutputHTML(filename);
  if (!crawledHTML) {
    console.log(`❌ OUTPUT FILE NOT FOUND: ${filename}`);
    return { passed: false, score: 0 };
  }
  
  console.log(`📄 Crawled file size: ${crawledHTML.length} bytes`);
  
  // Extract info from crawled HTML
  const crawledInfo = extractTagInfo(crawledHTML);
  
  console.log(`\n📊 Crawled Output Info:`);
  console.log(`   Title: ${crawledInfo.title || 'N/A'}`);
  console.log(`   Description: ${crawledInfo.description ? crawledInfo.description.substring(0, 60) + '...' : 'N/A'}`);
  console.log(`   H1 Count: ${crawledInfo.h1Count}, H2 Count: ${crawledInfo.h2Count}`);
  console.log(`   Images: ${crawledInfo.imageCount}, Links: ${crawledInfo.linkCount}, Scripts: ${crawledInfo.scriptCount}`);
  console.log(`   Body Class: ${crawledInfo.bodyClass || 'N/A'}`);
  
  // Fetch live site with Playwright
  console.log(`\n🌐 Fetching live site for comparison...`);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    const liveHTML = await page.content();
    const liveInfo = extractTagInfo(liveHTML);
    
    console.log(`\n📊 Live Site Info:`);
    console.log(`   Title: ${liveInfo.title || 'N/A'}`);
    console.log(`   Description: ${liveInfo.description ? liveInfo.description.substring(0, 60) + '...' : 'N/A'}`);
    console.log(`   H1 Count: ${liveInfo.h1Count}, H2 Count: ${liveInfo.h2Count}`);
    console.log(`   Images: ${liveInfo.imageCount}, Links: ${liveInfo.linkCount}, Scripts: ${liveInfo.scriptCount}`);
    console.log(`   Body Class: ${liveInfo.bodyClass || 'N/A'}`);
    
    // Compare
    const comparison = compareInfo(crawledInfo, liveInfo, url);
    
    console.log(`\n✅ Similarities (${comparison.similarities.length}):`);
    comparison.similarities.forEach(s => console.log(`   ${s}`));
    
    if (comparison.differences.length > 0) {
      console.log(`\n❌ Differences (${comparison.differences.length}):`);
      comparison.differences.forEach(d => console.log(`   ${d}`));
    }
    
    const score = comparison.score;
    const passed = score >= 0.8; // 80% pass threshold
    
    console.log(`\n📈 Similarity Score: ${(score * 100).toFixed(1)}%`);
    console.log(`${passed ? '✅ PASS' : '❌ FAIL'}: ${passed ? 'Output is similar to live site' : 'Output differs significantly from live site'}`);
    
    await context.close();
    return { passed, score, differences: comparison.differences.length };
    
  } catch (error) {
    console.error(`❌ Error testing ${url}: ${error.message}`);
    await context.close();
    return { passed: false, score: 0, error: error.message };
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('='.repeat(70));
  console.log('🔍 OUTPUT SIMILARITY TEST FRAMEWORK');
  console.log('='.repeat(70));
  console.log('Comparing crawled output against live websites...\n');
  
  let browser = null;
  const results = [];
  
  try {
    browser = await chromium.launch({ headless: true });
    
    for (const target of targets) {
      const result = await testTarget(browser, target);
      results.push({ url: target.url, filename: target.filename, ...result });
    }
    
    // Summary
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(70));
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    console.log(`Total Tests: ${results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`\nAverage Similarity: ${(results.reduce((sum, r) => sum + r.score, 0) / results.length * 100).toFixed(1)}%`);
    
    console.log(`\nResults:`);
    results.forEach(r => {
      const status = r.passed ? '✅' : '❌';
      console.log(`   ${status} ${r.filename}: ${(r.score * 100).toFixed(1)}% ${r.error ? `(Error: ${r.error})` : ''}`);
    });
    
    console.log('='.repeat(70));
    
    if (failed > 0) {
      process.exit(1);
    }
    
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
