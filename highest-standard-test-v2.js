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
 * Metric categories with weights and tolerances
 */
const METRIC_CATEGORIES = {
  critical: {
    weight: 3,
    tolerance: 0, // Exact match required
    metrics: ['title', 'description', 'h1Texts', 'visibleTextLength']
  },
  stable: {
    weight: 2,
    tolerance: 0.05, // 5% tolerance
    metrics: ['h2Texts', 'linkCount', 'imageCount']
  },
  dynamic: {
    weight: 1,
    tolerance: 0.50, // 50% tolerance for highly dynamic content
    metrics: ['paragraphCount', 'domNodeCount']
  }
};

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
  let cleaned = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  
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
    domNodeCount: 0,
    visibleTextLength: 0
  };
  
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  if (titleMatch) structure.title = titleMatch[1].trim();
  
  const descMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)/i) ||
                    html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i);
  if (descMatch) structure.description = descMatch[1].trim();
  
  const h1Matches = html.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi);
  for (const match of h1Matches) {
    const text = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) structure.h1Texts.push(text);
  }
  
  const h2Matches = html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/gi);
  for (const match of h2Matches) {
    const text = match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text) structure.h2Texts.push(text);
  }
  
  structure.paragraphCount = (html.match(/<p/gi) || []).length;
  structure.linkCount = (html.match(/<a\s/gi) || []).length;
  structure.imageCount = (html.match(/<img/gi) || []).length;
  structure.domNodeCount = countDOMNodes(html);
  
  const visibleText = extractVisibleText(html);
  structure.visibleTextLength = visibleText.length;
  
  return structure;
}

/**
 * Compare metric with appropriate tolerance
 */
function compareMetric(metricName, crawled, live, category) {
  const config = METRIC_CATEGORIES[category];
  
  let match = false;
  let diff = 0;
  
  if (typeof crawled === 'string') {
    // String comparison (exact match for critical)
    match = crawled === live;
    diff = match ? 0 : 1;
  } else if (Array.isArray(crawled)) {
    // Array comparison
    if (category === 'critical') {
      match = JSON.stringify(crawled) === JSON.stringify(live);
    } else {
      const lenDiff = Math.abs(crawled.length - live.length);
      const tolerance = Math.ceil(live.length * config.tolerance);
      match = lenDiff <= tolerance || lenDiff <= 2;
    }
    diff = Math.abs(crawled.length - live.length);
  } else {
    // Number comparison
    const numDiff = Math.abs(crawled - live);
    const tolerance = Math.ceil(live * config.tolerance);
    match = numDiff <= tolerance;
    diff = numDiff;
  }
  
  return {
    match,
    diff,
    category,
    weight: config.weight,
    tolerance: config.tolerance,
    crawled,
    live
  };
}

/**
 * Compare two content structures with weighted scoring
 */
function compareStructuresWeighted(crawled, live) {
  const results = [];
  
  // Critical metrics
  results.push({
    name: 'Title',
    ...compareMetric('title', crawled.title, live.title, 'critical')
  });
  
  results.push({
    name: 'Description',
    ...compareMetric('description', crawled.description, live.description, 'critical')
  });
  
  results.push({
    name: 'H1 content',
    ...compareMetric('h1Texts', crawled.h1Texts, live.h1Texts, 'critical')
  });
  
  results.push({
    name: 'Visible text length',
    ...compareMetric('visibleTextLength', crawled.visibleTextLength, live.visibleTextLength, 'critical')
  });
  
  // Stable metrics
  results.push({
    name: 'H2 count',
    ...compareMetric('h2Texts', crawled.h2Texts.length, live.h2Texts.length, 'stable')
  });
  
  results.push({
    name: 'Links',
    ...compareMetric('linkCount', crawled.linkCount, live.linkCount, 'stable')
  });
  
  results.push({
    name: 'Images',
    ...compareMetric('imageCount', crawled.imageCount, live.imageCount, 'stable')
  });
  
  // Dynamic metrics
  results.push({
    name: 'Paragraphs',
    ...compareMetric('paragraphCount', crawled.paragraphCount, live.paragraphCount, 'dynamic')
  });
  
  results.push({
    name: 'DOM nodes',
    ...compareMetric('domNodeCount', crawled.domNodeCount, live.domNodeCount, 'dynamic')
  });
  
  // Calculate weighted score
  const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
  const achievedWeight = results.filter(r => r.match).reduce((sum, r) => sum + r.weight, 0);
  const score = ((achievedWeight / totalWeight) * 100).toFixed(1);
  
  // Categorize results
  const critical = results.filter(r => r.category === 'critical');
  const stable = results.filter(r => r.category === 'stable');
  const dynamic = results.filter(r => r.category === 'dynamic');
  
  return {
    results,
    critical,
    stable,
    dynamic,
    score: parseFloat(score),
    allCriticalPassed: critical.every(r => r.match)
  };
}

/**
 * Test a single target
 */
async function testTarget(browser, target) {
  console.log(`\n${'='.repeat(70)}`);
  console.log(`🔍 Testing: ${target.url}`);
  console.log('='.repeat(70));
  
  const crawledHTML = loadOutputHTML(target.filename);
  if (!crawledHTML) {
    console.log(`❌ OUTPUT FILE NOT FOUND: ${target.filename}`);
    return { passed: false, score: 0 };
  }
  
  console.log(`📄 Crawled file size: ${crawledHTML.length} bytes`);
  
  const crawledStructure = extractContentStructure(crawledHTML);
  
  console.log(`\n📊 Crawled Content Info:`);
  console.log(`   Title: ${crawledStructure.title || 'N/A'}`);
  console.log(`   H1: ${crawledStructure.h1Texts.join(' | ') || 'N/A'}`);
  console.log(`   Paragraphs: ${crawledStructure.paragraphCount}, DOM nodes: ${crawledStructure.domNodeCount}`);
  console.log(`   Visible text: ${crawledStructure.visibleTextLength} chars`);
  
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
    console.log(`   Paragraphs: ${liveStructure.paragraphCount}, DOM nodes: ${liveStructure.domNodeCount}`);
    console.log(`   Visible text: ${liveStructure.visibleTextLength} chars`);
    
    const comparison = compareStructuresWeighted(crawledStructure, liveStructure);
    
    // Display results by category
    console.log(`\n🔴 Critical Content (must match 100%):`);
    comparison.critical.forEach(r => {
      const icon = r.match ? '✅' : '❌';
      const note = r.match ? '' : ' (CONTENT MISMATCH!)';
      console.log(`   ${icon} ${r.name}: ${JSON.stringify(r.crawled).substring(0, 60)}${note}`);
    });
    
    console.log(`\n🟡 Stable Elements (±5% tolerance):`);
    comparison.stable.forEach(r => {
      const icon = r.match ? '✅' : '⚠️';
      const note = r.match ? '' : ` (diff: ${r.diff})`;
      console.log(`   ${icon} ${r.name}: ${r.crawled} vs ${r.live}${note}`);
    });
    
    console.log(`\n🔵 Dynamic Content (±50% tolerance):`);
    comparison.dynamic.forEach(r => {
      const icon = r.match ? '✅' : '⚠️';
      const note = r.match ? '' : ` (diff: ${r.diff})`;
      console.log(`   ${icon} ${r.name}: ${r.crawled} vs ${r.live}${note}`);
      if (!r.match) {
        console.log(`      ℹ️  Site may have lazy-loaded content after crawl`);
      }
    });
    
    console.log(`\n📈 Weighted Similarity Score: ${comparison.score}%`);
    
    // Pass if: all critical match AND score >= 85%
    const passed = comparison.allCriticalPassed && comparison.score >= 85;
    
    if (passed) {
      console.log(`✅ PASS: All critical content captured`);
    } else if (!comparison.allCriticalPassed) {
      console.log(`❌ FAIL: Critical content mismatch - crawler needs fixing`);
    } else {
      console.log(`⚠️  PARTIAL: Critical content OK but significant dynamic variance`);
    }
    
    await context.close();
    return { 
      passed, 
      score: comparison.score,
      allCriticalPassed: comparison.allCriticalPassed,
      criticalCount: comparison.critical.filter(r => r.match).length,
      stableCount: comparison.stable.filter(r => r.match).length,
      dynamicCount: comparison.dynamic.filter(r => r.match).length,
      totalCritical: comparison.critical.length,
      totalStable: comparison.stable.length,
      totalDynamic: comparison.dynamic.length
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
  console.log('🏆 HIGHEST STANDARD VALIDATION TEST v2');
  console.log('='.repeat(70));
  console.log('Weighted Scoring System:\n');
  console.log('🔴 Critical (×3 weight): Title, Description, H1, Visible text');
  console.log('   → Must match 100% or test FAILS');
  console.log('🟡 Stable (×2 weight): H2 count, Links, Images');
  console.log('   → ±5% tolerance acceptable');
  console.log('🔵 Dynamic (×1 weight): Paragraphs, DOM nodes');
  console.log('   → ±50% tolerance (sites load content dynamically)\n');
  
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
    const partial = results.filter(r => r.allCriticalPassed && !r.passed).length;
    const failed = results.filter(r => !r.allCriticalPassed).length;
    
    console.log(`Total Sites: ${results.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`⚠️  Partial (critical OK): ${partial}`);
    console.log(`❌ Failed (critical mismatch): ${failed}`);
    
    const avgScore = (results.reduce((sum, r) => sum + r.score, 0) / results.length).toFixed(1);
    console.log(`\nAverage Weighted Score: ${avgScore}%`);
    
    console.log(`\nDetailed Results:`);
    results.forEach(r => {
      if (r.error) {
        console.log(`   ❌ ${r.filename}: ERROR - ${r.error}`);
      } else {
        const status = r.passed ? '✅' : r.allCriticalPassed ? '⚠️' : '❌';
        console.log(`   ${status} ${r.filename}: ${r.score}% | Critical: ${r.criticalCount}/${r.totalCritical} | Stable: ${r.stableCount}/${r.totalStable} | Dynamic: ${r.dynamicCount}/${r.totalDynamic}`);
      }
    });
    
    console.log('='.repeat(70));
    
    if (failed > 0) {
      console.log('\n❌ CRITICAL FAILURES: Crawler not capturing essential content');
      process.exit(1);
    } else if (partial > 0) {
      console.log('\n⚠️  RECOMMENDATION: Re-crawl to update dynamic content');
      console.log('   Run: node crawler.js && node highest-standard-test-v2.js');
    } else {
      console.log('\n✅ ALL TESTS PASSED: Crawler working perfectly!');
    }
    
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
}

main();
