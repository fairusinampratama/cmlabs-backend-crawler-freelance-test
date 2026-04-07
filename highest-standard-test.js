const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, 'output');

// Target URLs and their output files
const targets = [
  { url: 'https://cmlabs.co', filename: 'cmlabs.html', name: 'cmlabs' },
  { url: 'https://sequence.day', filename: 'sequence.html', name: 'sequence' },
  { url: 'https://react.dev', filename: 'free_choice.html', name: 'react' }
];

/**
 * Load HTML from file
 */
function loadOutputHTML(filename) {
  const filepath = path.join(OUTPUT_DIR, filename);
  if (!fs.existsSync(filepath)) return null;
  return fs.readFileSync(filepath, 'utf-8');
}

/**
 * Extract visible text from HTML
 */
function extractVisibleText(html) {
  // Remove script, style, noscript tags with their content
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  
  // Extract text between tags
  const text = cleaned
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  return text;
}

/**
 * Count DOM nodes from HTML
 */
function countDOMNodes(html) {
  // Count opening tags as a proxy for DOM nodes
  const tagMatches = html.match(/<[a-zA-Z][^>]*>/g) || [];
  return tagMatches.length;
}

/**
 * Extract detailed content structure
 */
function extractContentStructure(html) {
  const structure = {
    title: '',
    description: '',
    h1Texts: [],
    h2Texts: [],
    paragraphCount: 0,
    linkCount: 0,
    imageCount: 0,
    scriptCount: 0,
    styleCount: 0,
    domNodeCount: 0,
    visibleTextLength: 0,
    visibleText: ''
  };
  
  // Title
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) structure.title = titleMatch[1].trim();
  
  // Description
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) ||
                    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  if (descMatch) structure.description = descMatch[1].trim();
  
  // H1 texts
  const h1Matches = html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  for (const match of h1Matches) {
    const text = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) structure.h1Texts.push(text);
  }
  
  // H2 texts
  const h2Matches = html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi);
  for (const match of h2Matches) {
    const text = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) structure.h2Texts.push(text);
  }
  
  // Count elements
  structure.paragraphCount = (html.match(/<p/gi) || []).length;
  structure.linkCount = (html.match(/<a\s/gi) || []).length;
  structure.imageCount = (html.match(/<img/gi) || []).length;
  structure.scriptCount = (html.match(/<script/gi) || []).length;
  structure.styleCount = (html.match(/<style/gi) || []).length;
  structure.domNodeCount = countDOMNodes(html);
  
  // Visible text
  structure.visibleText = extractVisibleText(html);
  structure.visibleTextLength = structure.visibleText.length;
  
  return structure;
}

/**
 * Compare two content structures
 */
function compareStructures(crawled, live, targetName) {
  const mismatches = [];
  const matches = [];
  
  // Title comparison
  if (crawled.title === live.title) {
    matches.push(`Title: "${crawled.title.substring(0, 50)}${crawled.title.length > 50 ? '...' : ''}"`);
  } else {
    mismatches.push({
      field: 'Title',
      crawled: crawled.title,
      live: live.title
    });
  }
  
  // Description comparison
  if (crawled.description === live.description) {
    matches.push(`Description: ${crawled.description.length} chars`);
  } else {
    mismatches.push({
      field: 'Description',
      crawled: crawled.description.substring(0, 60),
      live: live.description.substring(0, 60)
    });
  }
  
  // H1 comparison
  if (crawled.h1Texts.length === live.h1Texts.length) {
    const h1Match = crawled.h1Texts.every((ct, i) => ct === live.h1Texts[i]);
    if (h1Match) {
      matches.push(`H1 headings: ${crawled.h1Texts.length} (exact match)`);
    } else {
      mismatches.push({
        field: 'H1 content',
        crawled: crawled.h1Texts,
        live: live.h1Texts
      });
    }
  } else {
    mismatches.push({
      field: 'H1 count',
      crawled: crawled.h1Texts.length,
      live: live.h1Texts.length
    });
  }
  
  // H2 comparison (allow ±1 difference)
  const h2Diff = Math.abs(crawled.h2Texts.length - live.h2Texts.length);
  if (h2Diff <= 1) {
    matches.push(`H2 headings: ${crawled.h2Texts.length} vs ${live.h2Texts.length}`);
  } else {
    mismatches.push({
      field: 'H2 count',
      crawled: crawled.h2Texts.length,
      live: live.h2Texts.length
    });
  }
  
  // Paragraph count (within 5%)
  const pDiff = Math.abs(crawled.paragraphCount - live.paragraphCount);
  const pTolerance = Math.ceil(live.paragraphCount * 0.05);
  if (pDiff <= pTolerance || pDiff <= 2) {
    matches.push(`Paragraphs: ${crawled.paragraphCount} vs ${live.paragraphCount}`);
  } else {
    mismatches.push({
      field: 'Paragraph count',
      crawled: crawled.paragraphCount,
      live: live.paragraphCount
    });
  }
  
  // DOM node count (within 5%)
  const nodeDiff = Math.abs(crawled.domNodeCount - live.domNodeCount);
  const nodeTolerance = Math.ceil(live.domNodeCount * 0.05);
  if (nodeDiff <= nodeTolerance) {
    matches.push(`DOM nodes: ${crawled.domNodeCount} vs ${live.domNodeCount}`);
  } else {
    mismatches.push({
      field: 'DOM node count',
      crawled: crawled.domNodeCount,
      live: live.domNodeCount,
      diff: nodeDiff
    });
  }
  
  // Visible text length (within 10%)
  const textDiff = Math.abs(crawled.visibleTextLength - live.visibleTextLength);
  const textTolerance = Math.ceil(live.visibleTextLength * 0.1);
  if (textDiff <= textTolerance) {
    matches.push(`Visible text: ${crawled.visibleTextLength} vs ${live.visibleTextLength} chars`);
  } else {
    mismatches.push({
      field: 'Visible text length',
      crawled: crawled.visibleTextLength,
      live: live.visibleTextLength,
      diff: textDiff
    });
  }
  
  // Link count (within 5%)
  const linkDiff = Math.abs(crawled.linkCount - live.linkCount);
  const linkTolerance = Math.ceil(live.linkCount * 0.05);
  if (linkDiff <= linkTolerance) {
    matches.push(`Links: ${crawled.linkCount} vs ${live.linkCount}`);
  } else {
    mismatches.push({
      field: 'Link count',
      crawled: crawled.linkCount,
      live: live.linkCount
    });
  }
  
  // Image count (within 10%)
  const imgDiff = Math.abs(crawled.imageCount - live.imageCount);
  const imgTolerance = Math.ceil(live.imageCount * 0.1);
  if (imgDiff <= imgTolerance) {
    matches.push(`Images: ${crawled.imageCount} vs ${live.imageCount}`);
  } else {
    mismatches.push({
      field: 'Image count',
      crawled: crawled.imageCount,
      live: live.imageCount
    });
  }
  
  // Calculate overall score
  const total = matches.length + mismatches.length;
  const score = (matches.length / total * 100).toFixed(1);
  
  return { matches, mismatches, score: parseFloat(score) };
}

/**
 * Test a single target
 */
async function testTarget(browser, target) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 Testing: ${target.url}`);
  console.log('='.repeat(70));
  
  // Load crawled HTML
  const crawledHTML = loadOutputHTML(target.filename);
  if (!crawledHTML) {
    console.log(`❌ OUTPUT FILE NOT FOUND: ${target.filename}`);
    return { passed: false, score: 0 };
  }
  
  console.log(`📄 Crawled file size: ${crawledHTML.length} bytes`);
  
  // Extract crawled structure
  const crawledStructure = extractContentStructure(crawledHTML);
  
  console.log(`\n📊 Crawled Content Info:`);
  console.log(`   Title: ${crawledStructure.title || 'N/A'}`);
  console.log(`   H1: ${crawledStructure.h1Texts.join(' | ') || 'N/A'}`);
  console.log(`   H2 count: ${crawledStructure.h2Texts.length}`);
  console.log(`   Paragraphs: ${crawledStructure.paragraphCount}`);
  console.log(`   DOM nodes: ${crawledStructure.domNodeCount}`);
  console.log(`   Visible text: ${crawledStructure.visibleTextLength} chars`);
  console.log(`   Links: ${crawledStructure.linkCount}, Images: ${crawledStructure.imageCount}`);
  
  // Fetch live site
  console.log(`\n🌐 Fetching live site for comparison...`);
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  });
  const page = await context.newPage();
  
  try {
    await page.goto(target.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(2000);
    
    const liveHTML = await page.content();
    const liveStructure = extractContentStructure(liveHTML);
    
    console.log(`\n📊 Live Site Info:`);
    console.log(`   Title: ${liveStructure.title || 'N/A'}`);
    console.log(`   H1: ${liveStructure.h1Texts.join(' | ') || 'N/A'}`);
    console.log(`   H2 count: ${liveStructure.h2Texts.length}`);
    console.log(`   Paragraphs: ${liveStructure.paragraphCount}`);
    console.log(`   DOM nodes: ${liveStructure.domNodeCount}`);
    console.log(`   Visible text: ${liveStructure.visibleTextLength} chars`);
    console.log(`   Links: ${liveStructure.linkCount}, Images: ${liveStructure.imageCount}`);
    
    // Compare structures
    const comparison = compareStructures(crawledStructure, liveStructure, target.name);
    
    console.log(`\n✅ Matches (${comparison.matches.length}):`);
    comparison.matches.forEach(m => console.log(`   ✓ ${m}`));
    
    if (comparison.mismatches.length > 0) {
      console.log(`\n❌ Mismatches (${comparison.mismatches.length}):`);
      comparison.mismatches.forEach(m => {
        console.log(`   ✗ ${m.field}:`);
        console.log(`     Crawled: ${JSON.stringify(m.crawled).substring(0, 100)}`);
        console.log(`     Live:    ${JSON.stringify(m.live).substring(0, 100)}`);
      });
    }
    
    console.log(`\n📈 Similarity Score: ${comparison.score}%`);
    
    const passed = comparison.score >= 90;
    console.log(`${passed ? '✅ PASS' : '❌ FAIL'}: ${passed ? 'High structural similarity' : 'Low structural similarity'}`);
    
    await context.close();
    return { 
      passed, 
      score: comparison.score,
      matches: comparison.matches.length,
      mismatches: comparison.mismatches.length,
      crawled: crawledStructure,
      live: liveStructure
    };
    
  } catch (error) {
    console.error(`❌ Error testing ${target.url}: ${error.message}`);
    await context.close();
    return { passed: false, score: 0, error: error.message };
  }
}

/**
 * Main test function
 */
async function main() {
  console.log('='.repeat(70));
  console.log('🏆 HIGHEST STANDARD VALIDATION TEST');
  console.log('='.repeat(70));
  console.log('Phase 1: Critical Structure & Content Tests\n');
  console.log('Testing for:');
  console.log('  • Exact Title match');
  console.log('  • Exact Description match');
  console.log('  • Exact H1 content match');
  console.log('  • DOM node count (within 5%)');
  console.log('  • Visible text length (within 10%)');
  console.log('  • Paragraph count (within 5%)');
  console.log('  • Link count (within 5%)');
  console.log('  • Image count (within 10%)');
  
  let browser = null;
  const results = [];
  
  try {
    browser = await chromium.launch({ headless: true });
    
    for (const target of targets) {
      const result = await testTarget(browser, target);
      results.push({ target: target.url, filename: target.filename, ...result });
    }
    
    // Summary
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 FINAL TEST SUMMARY');
    console.log('='.repeat(70));
    
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    
    console.log(`Total Sites: ${results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    
    const avgScore = (results.reduce((sum, r) => sum + r.score, 0) / results.length).toFixed(1);
    console.log(`\nAverage Similarity Score: ${avgScore}%`);
    
    console.log(`\nDetailed Results:`);
    results.forEach(r => {
      const status = r.passed ? '✅' : '❌';
      const errorMsg = r.error ? ` (Error: ${r.error})` : '';
      console.log(`   ${status} ${r.filename}: ${r.score}% | ${r.matches}✓ ${r.mismatches}✗${errorMsg}`);
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
