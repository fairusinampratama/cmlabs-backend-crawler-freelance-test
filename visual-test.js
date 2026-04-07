const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');
const PNG = require('pngjs').PNG;
const pixelmatchModule = require('pixelmatch');
const pixelmatch = pixelmatchModule.default || pixelmatchModule;

const OUTPUT_DIR = path.join(__dirname, 'output');
const SCREENSHOTS_DIR = path.join(__dirname, 'screenshots');

// Target URLs and their output files
const targets = [
  { url: 'https://cmlabs.co', filename: 'cmlabs.html', name: 'cmlabs' },
  { url: 'https://sequence.day', filename: 'sequence.html', name: 'sequence' },
  { url: 'https://react.dev', filename: 'free_choice.html', name: 'react' }
];

// Viewport sizes to test
const viewports = [
  { width: 1920, height: 1080, name: 'desktop' },
  { width: 1366, height: 768, name: 'laptop' },
  { width: 375, height: 667, name: 'mobile' }
];

/**
 * Create screenshots directory
 */
function ensureDirectories() {
  if (!fs.existsSync(SCREENSHOTS_DIR)) {
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
  }
}

/**
 * Simple HTTP server to serve HTML files
 */
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const filePath = path.join(OUTPUT_DIR, path.basename(req.url) || 'index.html');
      
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, 'utf-8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(content);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });
    
    server.listen(3456, () => {
      console.log('📡 Local server running on http://localhost:3456');
      resolve(server);
    });
  });
}

/**
 * Capture screenshot of live website
 */
async function captureLiveScreenshot(browser, target, viewport) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }
  });
  const page = await context.newPage();
  
  try {
    await page.goto(target.url, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(3000); // Wait for animations
    
    const screenshotPath = path.join(
      SCREENSHOTS_DIR, 
      `${target.name}-live-${viewport.name}.png`
    );
    
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    await context.close();
    return screenshotPath;
    
  } catch (error) {
    await context.close();
    throw error;
  }
}

/**
 * Capture screenshot of crawled HTML via local server
 */
async function captureCrawledScreenshot(browser, target, viewport, server) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height }
  });
  const page = await context.newPage();
  
  try {
    await page.goto(`http://localhost:3456/${target.filename}`, { 
      waitUntil: 'networkidle', 
      timeout: 60000 
    });
    await page.waitForTimeout(3000);
    
    const screenshotPath = path.join(
      SCREENSHOTS_DIR, 
      `${target.name}-crawled-${viewport.name}.png`
    );
    
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: true 
    });
    
    await context.close();
    return screenshotPath;
    
  } catch (error) {
    await context.close();
    throw error;
  }
}

/**
 * Resize PNG to target dimensions
 */
function resizePNG(source, targetWidth, targetHeight) {
  const resized = new PNG({ width: targetWidth, height: targetHeight });
  
  // Simple nearest-neighbor resize
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const srcX = Math.floor(x * source.width / targetWidth);
      const srcY = Math.floor(y * source.height / targetHeight);
      const srcIdx = (srcY * source.width + srcX) * 4;
      const dstIdx = (y * targetWidth + x) * 4;
      
      resized.data[dstIdx] = source.data[srcIdx];
      resized.data[dstIdx + 1] = source.data[srcIdx + 1];
      resized.data[dstIdx + 2] = source.data[srcIdx + 2];
      resized.data[dstIdx + 3] = source.data[srcIdx + 3];
    }
  }
  
  return resized;
}

/**
 * Compare two screenshots and generate diff
 */
function compareScreenshots(livePath, crawledPath, targetName, viewportName) {
  let liveImg = PNG.sync.read(fs.readFileSync(livePath));
  let crawledImg = PNG.sync.read(fs.readFileSync(crawledPath));
  
  // Use consistent dimensions for comparison
  const width = Math.min(liveImg.width, crawledImg.width, 1920);
  const height = Math.min(liveImg.height, crawledImg.height, 5000); // Limit height
  
  // Resize if needed
  if (liveImg.width !== width || liveImg.height !== height) {
    liveImg = resizePNG(liveImg, width, height);
  }
  if (crawledImg.width !== width || crawledImg.height !== height) {
    crawledImg = resizePNG(crawledImg, width, height);
  }
  
  const diff = new PNG({ width, height });
  
  const diffPixels = pixelmatch(
    liveImg.data, 
    crawledImg.data, 
    diff.data, 
    width, 
    height, 
    { 
      threshold: 0.2, // Slightly higher threshold for dynamic content
      includeAA: false // Ignore anti-aliasing differences
    }
  );
  
  const totalPixels = width * height;
  const similarity = ((totalPixels - diffPixels) / totalPixels * 100).toFixed(2);
  
  const diffPath = path.join(
    SCREENSHOTS_DIR, 
    `${targetName}-diff-${viewportName}.png`
  );
  
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  
  return {
    similarity: parseFloat(similarity),
    diffPixels,
    totalPixels,
    diffPath
  };
}

/**
 * Validate content in crawled HTML
 */
function validateContent(target, html) {
  const validations = [];
  
  // File size check
  const sizeKB = (html.length / 1024).toFixed(1);
  validations.push({
    name: 'File Size',
    passed: html.length > 50000,
    value: `${sizeKB} KB`
  });
  
  // Content assertions per site
  if (target.name === 'cmlabs') {
    validations.push({
      name: 'Has "cmlabs" text',
      passed: html.includes('cmlabs'),
      value: html.includes('cmlabs') ? 'Found' : 'Missing'
    });
    validations.push({
      name: 'Has H1 heading',
      passed: /<h1/i.test(html),
      value: (html.match(/<h1/gi) || []).length + ' H1 tags'
    });
  } else if (target.name === 'sequence') {
    validations.push({
      name: 'Has "Sequence" text',
      passed: html.includes('Sequence') || html.includes('sequence'),
      value: html.includes('Sequence') ? 'Found' : 'Missing'
    });
    validations.push({
      name: 'Has H1 heading',
      passed: /<h1/i.test(html),
      value: (html.match(/<h1/gi) || []).length + ' H1 tags'
    });
  } else if (target.name === 'react') {
    validations.push({
      name: 'Has "React" text',
      passed: html.includes('React'),
      value: html.includes('React') ? 'Found' : 'Missing'
    });
    validations.push({
      name: 'Has H1 heading',
      passed: /<h1/i.test(html),
      value: (html.match(/<h1/gi) || []).length + ' H1 tags'
    });
  }
  
  // Check for empty root divs (bad sign)
  const emptyRootDivs = (html.match(/<div[^>]*id=["']root["'][^>]*>\s*<\/div>/gi) || []).length;
  validations.push({
    name: 'No empty root divs',
    passed: emptyRootDivs === 0,
    value: emptyRootDivs === 0 ? 'Clean' : `${emptyRootDivs} found`
  });
  
  return validations;
}

/**
 * Generate HTML report
 */
function generateReport(results) {
  const reportPath = path.join(__dirname, 'test-report.html');
  
  let html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Visual Test Report</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
    h1 { text-align: center; color: #333; }
    .summary { background: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .site-card { background: white; margin-bottom: 30px; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .site-header { background: #2c3e50; color: white; padding: 15px 20px; }
    .site-header h2 { margin: 0; }
    .viewport-section { padding: 20px; border-bottom: 1px solid #eee; }
    .viewport-section:last-child { border-bottom: none; }
    .viewport-title { font-weight: bold; margin-bottom: 15px; color: #666; }
    .comparison { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 15px; }
    .image-box { text-align: center; }
    .image-box img { max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 4px; }
    .image-label { font-size: 12px; color: #666; margin-top: 5px; }
    .similarity-score { 
      display: inline-block; 
      padding: 5px 15px; 
      border-radius: 20px; 
      font-weight: bold;
      margin-bottom: 10px;
    }
    .score-high { background: #d4edda; color: #155724; }
    .score-medium { background: #fff3cd; color: #856404; }
    .score-low { background: #f8d7da; color: #721c24; }
    .validations { margin-top: 15px; padding: 15px; background: #f8f9fa; border-radius: 4px; }
    .validation-item { display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px dotted #ddd; }
    .validation-item:last-child { border-bottom: none; }
    .pass { color: #28a745; }
    .fail { color: #dc3545; }
    .overall-pass { background: #d4edda; }
    .overall-fail { background: #f8d7da; }
  </style>
</head>
<body>
  <h1>🔍 Visual Test Report</h1>
  
  <div class="summary">
    <h3>Summary</h3>
    <p><strong>Test Date:</strong> ${new Date().toLocaleString()}</p>
    <p><strong>Total Sites:</strong> ${results.length}</p>
    <p><strong>Passed:</strong> ${results.filter(r => r.passed).length}</p>
    <p><strong>Failed:</strong> ${results.filter(r => !r.passed).length}</p>
  </div>
`;

  for (const result of results) {
    const overallClass = result.passed ? 'overall-pass' : 'overall-fail';
    
    html += `
  <div class="site-card ${overallClass}">
    <div class="site-header">
      <h2>${result.target.url} ${result.passed ? '✅' : '❌'}</h2>
    </div>
`;

    for (const vp of result.viewportResults) {
      const scoreClass = vp.comparison.similarity >= 95 ? 'score-high' : 
                        vp.comparison.similarity >= 85 ? 'score-medium' : 'score-low';
      
      html += `
    <div class="viewport-section">
      <div class="viewport-title">Viewport: ${vp.viewport.width}x${vp.viewport.name}</div>
      <div class="similarity-score ${scoreClass}">
        Similarity: ${vp.comparison.similarity}%
      </div>
      
      <div class="comparison">
        <div class="image-box">
          <img src="screenshots/${path.basename(vp.liveScreenshot)}" alt="Live site">
          <div class="image-label">Live Website</div>
        </div>
        <div class="image-box">
          <img src="screenshots/${path.basename(vp.crawledScreenshot)}" alt="Crawled">
          <div class="image-label">Crawled HTML</div>
        </div>
        <div class="image-box">
          <img src="screenshots/${path.basename(vp.comparison.diffPath)}" alt="Diff">
          <div class="image-label">Diff (red = different)</div>
        </div>
      </div>
    </div>
`;
    }
    
    // Validations
    html += `
    <div class="validations">
      <strong>Content Validations:</strong>
`;
    for (const val of result.validations) {
      const icon = val.passed ? '<span class="pass">✓</span>' : '<span class="fail">✗</span>';
      html += `
      <div class="validation-item">
        <span>${icon} ${val.name}</span>
        <span>${val.value}</span>
      </div>
`;
    }
    html += `    </div>
  </div>
`;
  }
  
  html += `
</body>
</html>
`;
  
  fs.writeFileSync(reportPath, html);
  return reportPath;
}

/**
 * Main test function
 */
async function main() {
  console.log('='.repeat(70));
  console.log('📸 VISUAL VALIDATION TEST');
  console.log('='.repeat(70));
  
  ensureDirectories();
  
  let browser = null;
  let server = null;
  const results = [];
  
  try {
    // Start browser and server
    browser = await chromium.launch({ headless: true });
    server = await startServer();
    
    for (const target of targets) {
      console.log(`\n🌐 Testing: ${target.url}`);
      
      const viewportResults = [];
      let allPassed = true;
      
      // Only test desktop viewport for speed
      const viewport = viewports[0]; // desktop only
      
      try {
        // Capture live screenshot
        console.log(`  📸 Capturing live site (${viewport.name})...`);
        const liveScreenshot = await captureLiveScreenshot(browser, target, viewport);
        
        // Capture crawled screenshot
        console.log(`  📸 Capturing crawled HTML (${viewport.name})...`);
        const crawledScreenshot = await captureCrawledScreenshot(browser, target, viewport, server);
        
        // Compare
        console.log(`  🔍 Comparing screenshots...`);
        const comparison = compareScreenshots(liveScreenshot, crawledScreenshot, target.name, viewport.name);
        
        console.log(`  📊 Similarity: ${comparison.similarity}%`);
        
        viewportResults.push({
          viewport,
          liveScreenshot,
          crawledScreenshot,
          comparison
        });
        
        if (comparison.similarity < 90) {
          allPassed = false;
        }
        
      } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        allPassed = false;
      }
      
      // Content validation
      const html = fs.readFileSync(path.join(OUTPUT_DIR, target.filename), 'utf-8');
      const validations = validateContent(target, html);
      
      for (const val of validations) {
        console.log(`  ${val.passed ? '✅' : '❌'} ${val.name}: ${val.value}`);
        if (!val.passed) allPassed = false;
      }
      
      results.push({
        target,
        passed: allPassed,
        viewportResults,
        validations
      });
    }
    
    // Generate report
    console.log(`\n📄 Generating HTML report...`);
    const reportPath = generateReport(results);
    
    // Summary
    console.log(`\n${'='.repeat(70)}`);
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Sites: ${results.length}`);
    console.log(`✅ Passed: ${results.filter(r => r.passed).length}`);
    console.log(`❌ Failed: ${results.filter(r => !r.passed).length}`);
    console.log(`\n📄 Report saved: ${reportPath}`);
    console.log(`📸 Screenshots saved: ${SCREENSHOTS_DIR}/`);
    console.log('='.repeat(70));
    
  } catch (error) {
    console.error(`Fatal error: ${error.message}`);
  } finally {
    if (server) server.close();
    if (browser) await browser.close();
  }
}

main();
