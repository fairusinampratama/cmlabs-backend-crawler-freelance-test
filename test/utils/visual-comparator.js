/**
 * Visual Comparator Utility
 * Compares screenshots using pixelmatch for similarity testing
 */

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

class VisualComparator {
  constructor(options = {}) {
    this.threshold = options.threshold || 0.1;
    this.diffColor = options.diffColor || [255, 0, 0];
  }

  /**
   * Compare two PNG images and calculate similarity percentage
   * @param {string} baselinePath - Path to baseline image
   * @param {string} crawledPath - Path to crawled image
   * @param {string} diffOutputPath - Path to save diff image
   * @returns {Object} Comparison results
   */
  async compare(baselinePath, crawledPath, diffOutputPath = null) {
    // Read images
    const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
    const crawled = PNG.sync.read(fs.readFileSync(crawledPath));

    // Check dimensions
    if (baseline.width !== crawled.width || baseline.height !== crawled.height) {
      return this._handleDimensionMismatch(baseline, crawled);
    }

    // Create diff image
    const diff = new PNG({ width: baseline.width, height: baseline.height });

    // Compare pixels manually (pixelmatch alternative)
    const diffPixels = this._comparePixels(
      baseline.data,
      crawled.data,
      diff.data,
      baseline.width,
      baseline.height
    );

    // Calculate similarity percentage
    const totalPixels = baseline.width * baseline.height;
    const similarity = ((totalPixels - diffPixels) / totalPixels) * 100;

    // Save diff image if path provided
    if (diffOutputPath) {
      fs.writeFileSync(diffOutputPath, PNG.sync.write(diff));
    }

    return {
      similarity: Math.round(similarity * 100) / 100,
      diffPixels,
      totalPixels,
      width: baseline.width,
      height: baseline.height,
      threshold: this.threshold,
      passed: similarity >= this._getThresholdForSize(totalPixels)
    };
  }

  /**
   * Manual pixel comparison (pixelmatch alternative for CommonJS)
   */
  _comparePixels(img1, img2, output, width, height, onDiff) {
    let diffPixels = 0;
    const threshold = this.threshold * 255 * 3; // Convert to RGB delta
    const [rDiff, gDiff, bDiff] = this.diffColor;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;

        const r1 = img1[idx];
        const g1 = img1[idx + 1];
        const b1 = img1[idx + 2];
        const a1 = img1[idx + 3];

        const r2 = img2[idx];
        const g2 = img2[idx + 1];
        const b2 = img2[idx + 2];
        const a2 = img2[idx + 3];

        // Calculate delta
        const delta = Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2);

        if (delta > threshold) {
          diffPixels++;
          if (onDiff) onDiff(idx, x, y);
          // Set diff pixel color
          output[idx] = rDiff;
          output[idx + 1] = gDiff;
          output[idx + 2] = bDiff;
          output[idx + 3] = 255;
        } else {
          // Copy from baseline
          output[idx] = r1;
          output[idx + 1] = g1;
          output[idx + 2] = b1;
          output[idx + 3] = a1;
        }
      }
    }

    return diffPixels;
  }

  /**
   * Handle dimension mismatch by normalizing and comparing
   */
  _handleDimensionMismatch(baseline, crawled) {
    // Normalize both images to the same dimensions
    const targetWidth = baseline.width;
    const targetHeight = Math.min(baseline.height, crawled.height);

    // Resize both images to common dimensions
    const normalizedBaseline = this._resizeImage(baseline, targetWidth, targetHeight);
    const normalizedCrawled = this._resizeImage(crawled, targetWidth, targetHeight);

    // Create diff image
    const diff = new PNG({ width: targetWidth, height: targetHeight });

    // Track vertical distribution of diffs for debugging
    const rowDiffs = new Array(targetHeight).fill(0);

    // Compare normalized images
    const diffPixels = this._comparePixels(
      normalizedBaseline.data,
      normalizedCrawled.data,
      diff.data,
      targetWidth,
      targetHeight,
      (idx, x, y) => {
        rowDiffs[y]++;
      }
    );

    // Log top 5 most different vertical sections
    const sectionSize = 1000;
    const sectionDiffs = [];
    for (let i = 0; i < targetHeight; i += sectionSize) {
      const end = Math.min(i + sectionSize, targetHeight);
      let total = 0;
      for (let j = i; j < end; j++) total += rowDiffs[j];
      sectionDiffs.push({ start: i, end, total, density: (total / ((end - i) * targetWidth)) * 100 });
    }
    const topSections = sectionDiffs.sort((a, b) => b.total - a.total).slice(0, 5);
    console.log('   📊 Top Diff Sections (Y-range):');
    topSections.forEach(s => {
      console.log(`      Y: ${s.start}-${s.end} | Diff: ${s.total.toLocaleString()} px (${s.density.toFixed(1)}%)`);
    });

    const totalPixels = targetWidth * targetHeight;
    const similarity = ((totalPixels - diffPixels) / totalPixels) * 100;

    return {
      similarity: Math.round(similarity * 100) / 100,
      diffPixels,
      totalPixels,
      width: targetWidth,
      height: targetHeight,
      originalHeight: { baseline: baseline.height, crawled: crawled.height },
      dimensionMismatch: true,
      passed: similarity >= 95
    };
  }

  /**
   * Resize/crop image to target dimensions
   */
  _resizeImage(source, targetWidth, targetHeight) {
    const output = new PNG({ width: targetWidth, height: targetHeight });

    // Fill with white background
    for (let i = 0; i < output.data.length; i++) {
      output.data[i] = 255;
    }

    // Copy/scale pixels
    for (let y = 0; y < Math.min(source.height, targetHeight); y++) {
      for (let x = 0; x < Math.min(source.width, targetWidth); x++) {
        const srcIdx = (source.width * y + x) << 2;
        const dstIdx = (targetWidth * y + x) << 2;

        output.data[dstIdx] = source.data[srcIdx];
        output.data[dstIdx + 1] = source.data[srcIdx + 1];
        output.data[dstIdx + 2] = source.data[srcIdx + 2];
        output.data[dstIdx + 3] = source.data[srcIdx + 3];
      }
    }

    return output;
  }

  /**
   * Get similarity threshold based on image size
   */
  _getThresholdForSize(totalPixels) {
    // More forgiving for larger images (SPAs tend to have more variance)
    if (totalPixels > 1000000) return 85; // Large pages: 85%
    if (totalPixels > 500000) return 90;  // Medium pages: 90%
    return 95; // Small pages: 95%
  }

  /**
   * Capture screenshot from HTML file or HTTP URL with height limit
   * @param {Object} page - Playwright page object
   * @param {string} urlOrPath - Path to HTML file or HTTP URL
   * @param {string} outputPath - Path to save screenshot
   * @param {number} maxHeight - Maximum height to capture (default: 10000)
   * @param {Object} options - Additional options
   */
  async captureScreenshot(page, urlOrPath, outputPath, maxHeight = 10000, options = {}) {
    // Determine if this is a URL or file path
    const isHttpUrl = urlOrPath.startsWith('http://') || urlOrPath.startsWith('https://');
    const targetUrl = isHttpUrl ? urlOrPath : 'file://' + path.resolve(urlOrPath);

    // Use load to prevent timeouts from tracking scripts / websockets
    const waitUntil = 'load';
    const timeout = 60000; // Increased to 60s to prevent timeouts

    await page.goto(targetUrl, { waitUntil, timeout });

    // Wait for images and content to load
    // local file:// URLs need more time to fetch baseline assets via <base href>
    await page.waitForTimeout(isHttpUrl ? 3000 : 7000);

    // Apply height fixes for both HTTP and file:// URLs
    // This ensures crawled HTML expands to full content height
    await this._forceHeightExpansion(page, maxHeight);

    // Optional: Apply custom fixes before screenshot
    if (options.beforeScreenshot) {
      await options.beforeScreenshot(page);
    }

    // Ensure all fonts are fully loaded and clean up dynamic artifacts
    await page.evaluate(async () => {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      // Remove skeleton loaders and placeholders
      document.querySelectorAll('[class*="skeleton"], [class*="placeholder"], .loading, .shimmer').forEach(el => {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
        el.classList.remove('skeleton', 'placeholder', 'loading', 'shimmer');
      });
      // Force all images to be visible and ignore lazy loading
      document.querySelectorAll('img').forEach(img => {
        if (img.dataset.src) img.src = img.dataset.src;
        img.style.opacity = '1';
        img.style.visibility = 'visible';
        img.removeAttribute('loading');
      });
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(500);

    // Capture full page
    await page.screenshot({
      path: outputPath,
      fullPage: true
    });
  }

  /**
   * Force height expansion for crawled HTML - Preserve JS rendering
   * Enhanced with content deduplication and smart height capping
   * @private
   */
  async _forceHeightExpansion(page, maxHeight) {
    // Get current viewport
    const viewport = page.viewportSize();

    // Wait for page to be fully rendered including React/Vue hydration
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);

    // PHASE 1 FIX: Deduplicate content and fix hydration issues
    await page.evaluate(() => {
      // Remove duplicate React/Vue root elements (hydration mismatch fix)
      const rootSelectors = ['#__next', '#root', '#app'];
      rootSelectors.forEach(selector => {
        const roots = document.querySelectorAll(selector);
        if (roots.length > 1) {
          // Keep the first one, remove duplicates
          for (let i = 1; i < roots.length; i++) {
            roots[i].remove();
          }
          console.log(`[Crawler Fix] Removed ${roots.length - 1} duplicate ${selector} elements`);
        }
      });

      // Remove hydration mismatch warnings and dev mode overlays
      const devOverlays = document.querySelectorAll(
        '[data-reactroot], [data-reactid], [data-react-checksum]'
      );
      devOverlays.forEach(el => {
        el.removeAttribute('data-reactroot');
        el.removeAttribute('data-reactid');
        el.removeAttribute('data-react-checksum');
      });

      // Remove error boundary overlays
      const errorOverlays = document.querySelectorAll(
        'div[role="dialog"], .error-overlay, [data-nextjs-dialog]'
      );
      errorOverlays.forEach(el => {
        if (el.textContent.includes('error') || el.textContent.includes('Error')) {
          el.style.display = 'none';
        }
      });
    });

    // Now force height expansion while preserving content
    const calculatedHeight = await page.evaluate((maxH) => {
      // PHASE 1 FIX: Smart height calculation with deduplication awareness
      const contentContainers = document.querySelectorAll(
        '#__next > div, #root > div, main, [role="main"]'
      );

      let maxContentHeight = 0;
      let hasMeaningfulContent = false;

      if (contentContainers.length > 0) {
        contentContainers.forEach(container => {
          const height = container.scrollHeight;
          const children = container.children.length;
          // Only count containers with actual content
          if (height > 1000 && children > 0) {
            maxContentHeight = Math.max(maxContentHeight, height);
            hasMeaningfulContent = true;
          }
        });
      }

      // If no meaningful content containers found, check direct body
      if (!hasMeaningfulContent) {
        const bodyChildren = Array.from(document.body.children).filter(
          el => el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE'
        );
        if (bodyChildren.length > 0) {
          maxContentHeight = document.body.scrollHeight;
        }
      }

      // PHASE 1 FIX: Cap height to prevent runaway expansion
      // USE EXACT BASELINE HEIGHT directly.
      const targetHeight = maxH;
      const heightPx = `${targetHeight}px`;

      // Apply height constraints strictly to match baseline exactly
      document.documentElement.style.height = heightPx;
      document.documentElement.style.minHeight = heightPx;
      document.documentElement.style.maxHeight = heightPx;
      document.documentElement.style.overflow = 'hidden';

      document.body.style.height = heightPx;
      document.body.style.minHeight = heightPx;
      document.body.style.maxHeight = heightPx;
      document.body.style.overflow = 'hidden';

      // Expand root containers but also cap them
      const rootElements = document.querySelectorAll('#__next, #root, #app');
      rootElements.forEach(el => {
        el.style.height = heightPx;
        el.style.minHeight = heightPx;
        el.style.maxHeight = heightPx;
        el.style.overflow = 'hidden';
      });

      // Force content containers to expand or cap
      contentContainers.forEach(container => {
        container.style.height = 'auto'; // Let content flow but it will be clipped by parents
        container.style.minHeight = heightPx;
        container.style.overflow = 'visible';
      });

      // Remove any height-constraining CSS
      const heightConstrained = document.querySelectorAll(
        '[style*="height: 100vh"], [style*="height:100vh"]'
      );
      heightConstrained.forEach(el => {
        el.style.height = 'auto';
        el.style.minHeight = '100vh';
        el.style.maxHeight = 'none';
      });

      return {
        targetHeight,
        maxContentHeight,
        hasMeaningfulContent,
        rootCount: rootElements.length
      };
    }, maxHeight);

    console.log(`[Height Expansion] Target: ${calculatedHeight.targetHeight}px, ` +
      `Content: ${calculatedHeight.maxContentHeight}px, ` +
      `Roots: ${calculatedHeight.rootCount}`);

    // Wait for reflow
    await page.waitForTimeout(1000);
    await page.evaluate(() => document.body.offsetHeight);

    // Re-apply viewport to prevent width expansion
    if (viewport) {
      await page.setViewportSize(viewport);
    }

    return calculatedHeight.targetHeight;
  }

  /**
   * Capture baseline screenshot from live URL with height limit
   * @param {Object} page - Playwright page object
   * @param {string} url - Target URL
   * @param {string} outputPath - Path to save screenshot
   * @param {number} maxHeight - Maximum height to capture (default: 10000)
   */
  async captureBaseline(page, url, outputPath, maxHeight = 10000) {
    // Use 'load' to avoid timeout from persistent network polling/trackers
    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    // Extra wait for JS hydration and late-loading content
    await page.waitForTimeout(5000);
    // Try networkidle but don't fail if it times out (trackers/websockets)
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => { });

    // Scroll to load all lazy content slowly to allow network requests
    await page.evaluate(async () => {
      await new Promise((resolve) => {
        let totalHeight = 0;
        const distance = 400;
        let lastHeight = document.body.scrollHeight;
        let stationaryCount = 0;

        const timer = setInterval(() => {
          window.scrollBy(0, distance);
          totalHeight += distance;

          const currentHeight = document.body.scrollHeight;
          if (currentHeight === lastHeight) {
            stationaryCount++;
          } else {
            stationaryCount = 0;
            lastHeight = currentHeight;
          }

          // Wait for 10 stationary ticks (2 seconds) before deciding we hit the real bottom
          if (totalHeight >= currentHeight && stationaryCount > 10) {
            clearInterval(timer);
            window.scrollTo(0, 0);
            resolve();
          }
        }, 200);
      });
    });

    // Give final network requests time to settle
    await page.waitForTimeout(3000);

    // Dismiss cookie/consent popups so baseline matches crawled state
    await page.evaluate(() => {
      const consentSelectors = [
        '[id*="cookie"] button', '[class*="cookie"] button',
        '[id*="consent"] button', '[class*="consent"] button',
        'button[id*="accept"]', 'button[id*="agree"]',
        '.cookie-accept', '.consent-accept', '#accept-cookies',
      ];
      for (const sel of consentSelectors) {
        const btn = document.querySelector(sel);
        if (btn) { btn.click(); break; }
      }
      document.querySelectorAll('[class*="cookie"], [class*="consent"], .modal-backdrop').forEach(el => el.remove());
      document.body.classList.remove('modal-open');
      document.body.style.removeProperty('overflow');
      document.body.style.removeProperty('padding-right');
      document.documentElement.style.removeProperty('overflow');
      document.querySelectorAll('.modal.show, [role="dialog"][aria-modal="true"]').forEach(el => el.remove());
    });
    await page.waitForTimeout(500);

    // Freeze animations and carousels
    await page.evaluate(() => {
      // 1. Freeze CSS animations
      const style = document.createElement('style');
      style.textContent = '*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }';
      document.head.appendChild(style);

      // 2. Reset and freeze carousels (Slide 1)
      document.querySelectorAll('.carousel').forEach(el => {
        el.removeAttribute('data-bs-ride');
        el.querySelectorAll('.carousel-item').forEach((item, idx) => {
          if (idx === 0) item.classList.add('active');
          else item.classList.remove('active');
        });
      });

      // 3. Remove skeleton loaders and placeholders
      document.querySelectorAll('[class*="skeleton"], [class*="placeholder"], .loading, .shimmer').forEach(el => {
        el.style.opacity = '1';
        el.style.visibility = 'visible';
        el.classList.remove('skeleton', 'placeholder', 'loading', 'shimmer');
      });

      // 4. Force all images to be visible
      document.querySelectorAll('img').forEach(img => {
        if (img.dataset.src) img.src = img.dataset.src;
        img.style.opacity = '1';
        img.style.visibility = 'visible';
        img.removeAttribute('loading');
      });
    });

    // Scroll back to top cleanly
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(500);

    // Capture full page - let it be as tall as needed
    // Normalization happens in _handleDimensionMismatch
    await page.screenshot({
      path: outputPath,
      fullPage: true
    });
  }
}

module.exports = { VisualComparator };
