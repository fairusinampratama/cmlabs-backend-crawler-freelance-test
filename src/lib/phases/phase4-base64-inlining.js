/**
 * Phase 4: Base64 Inlining & Smart Freeze Timing
 * 
 * This module implements:
 * 1. Smart Wait for Dynamic Content - Wait for loading indicators to disappear and content to stabilize
 * 2. Base64 Image Inlining - Convert external images to data URIs for offline viewing
 * 3. SVG Force-Inlining - Inline external SVG references (<use> tags)
 * 
 * Critical for >95% visual similarity on local file:// execution
 */

class Base64Inliner {
  constructor(options = {}) {
    this.options = {
      // Size limits for base64 encoding (in bytes)
      maxImageSize: options.maxImageSize || 2 * 1024 * 1024,      // 2MB for main images
      maxBgImageSize: options.maxBgImageSize || 1 * 1024 * 1024,  // 1MB for background images
      maxSvgSize: options.maxSvgSize || 500 * 1024,               // 500KB for SVGs

      // Smart wait options
      stabilizationTime: options.stabilizationTime || 3000,     // 3 seconds of stability required
      checkInterval: options.checkInterval || 500,                // Check every 500ms
      maxWaitTime: options.maxWaitTime || 60000,                  // Max 60s total wait

      // Concurrency for image fetching
      concurrency: options.concurrency || 10,

      // Limit total images to inline
      maxImages: options.maxImages || 200,

      // per-image timeout in ms
      fetchTimeout: options.fetchTimeout || 10000,

      // Debug logging
      debug: options.debug || false
    };

    this.stats = {
      imagesProcessed: 0,
      imagesBase64Encoded: 0,
      imagesFailed: 0,
      svgsInlined: 0,
      svgsFailed: 0,
      cssFilesProcessed: 0,
      totalBytesInlined: 0
    };
  }

  /**
   * Smart Wait for Dynamic Content
   * Waits for loading indicators to disappear AND content to stabilize
   * Critical for SPAs like sequence.day that fetch API data
   */
  async smartWaitForContent(page) {
    const startTime = Date.now();

    if (this.options.debug) {
      console.log('[Phase4] Starting smart content wait...');
    }

    try {
      // Phase 1: Wait for loading indicators to disappear
      await this._waitForLoadingIndicators(page);

      // Phase 2: Wait for content to stabilize (no significant text changes)
      await this._waitForStabilization(page, startTime);

      if (this.options.debug) {
        const elapsed = Date.now() - startTime;
        console.log(`[Phase4] Content stable after ${elapsed}ms`);
      }

      return true;
    } catch (error) {
      if (this.options.debug) {
        console.log(`[Phase4] Smart wait timeout or error: ${error.message}`);
      }
      // Continue anyway - don't block extraction
      return false;
    }
  }

  /**
   * Wait for loading indicators to disappear
   */
  async _waitForLoadingIndicators(page) {
    const loadingSelectors = [
      // Common loading classes
      '[class*="loading"]',
      '[class*="skeleton"]',
      '[class*="spinner"]',
      '[class*="loader"]',
      '[class*="progress"]',
      '[class*="pulse"]',
      '[class*="shimmer"]',
      '[class*="placeholder"]',

      // Specific framework patterns
      '.animate-pulse',
      '.skeleton-loader',
      '.loading-spinner',
      '.data-loading',
      '[data-loading="true"]',
      '[data-busy="true"]',
      '[aria-busy="true"]',

      // React/Vue/Angular specific
      '.react-loading',
      '.vue-loading',
      '.ng-loading',
      '.chakra-spinner',
      '.mantine-loading',
      '.ant-spin',
      '.MuiCircularProgress-root',

      // Common loader elements
      '.spinner',
      '.loader',
      '.loading-bar',
      '.progress-bar',
      '.skeleton',
      '.skeleton-text',
      '.skeleton-image',

      // Suspense boundaries
      '[data-suspense]',
      '[data-pending]',

      // Lazy loading indicators
      '.lazyload-placeholder',
      '.blur-up',
      '[data-lqip]'
    ];

    await page.waitForFunction((selectors) => {
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const el of elements) {
          const rect = el.getBoundingClientRect();
          const style = window.getComputedStyle(el);
          // Check if element is visible and not display:none
          if (rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden') {
            return false; // Still loading
          }
        }
      }

      // Also check for text content that indicates loading
      const bodyText = document.body.innerText || '';
      const loadingPhrases = ['loading...', 'please wait', 'loading data', 'fetching', 'retrieving'];
      for (const phrase of loadingPhrases) {
        if (bodyText.toLowerCase().includes(phrase)) {
          return false;
        }
      }

      return true; // All loading indicators gone
    }, loadingSelectors, { timeout: this.options.maxWaitTime / 2 });
  }

  /**
   * Wait for content to stabilize (no significant text/node count changes)
   */
  async _waitForStabilization(page, startTime) {
    let lastNodeCount = 0;
    let lastWordCount = 0;
    let stableTime = 0;

    while (stableTime < this.options.stabilizationTime) {
      // Check if we've exceeded max wait time
      if (Date.now() - startTime > this.options.maxWaitTime) {
        throw new Error('Max wait time exceeded');
      }

      await page.waitForTimeout(this.options.checkInterval);

      const metrics = await page.evaluate(() => {
        const allElements = document.querySelectorAll('*');
        const textElements = Array.from(allElements).filter(el => {
          const style = window.getComputedStyle(el);
          return style.display !== 'none' && style.visibility !== 'hidden';
        });

        const textContent = document.body.innerText || '';
        const wordCount = textContent.trim().split(/\s+/).filter(w => w.length > 0).length;

        return {
          nodeCount: textElements.length,
          wordCount: wordCount,
          paragraphCount: document.querySelectorAll('p, h1, h2, h3, h4, h5, h6, article, section').length,
          imageCount: document.querySelectorAll('img').length,
          hasContent: wordCount > 50 || document.querySelectorAll('p, article, section, main').length > 3
        };
      });

      // Calculate changes
      const nodeChange = Math.abs(metrics.nodeCount - lastNodeCount);
      const wordChange = Math.abs(metrics.wordCount - lastWordCount);

      // If content is stable (small changes), increment stable time
      if (nodeChange < 10 && wordChange < 20 && metrics.hasContent) {
        stableTime += this.options.checkInterval;
      } else {
        // Reset stable time if significant changes detected
        stableTime = 0;
        if (this.options.debug) {
          console.log(`[Phase4] Content still changing: +${nodeChange} nodes, +${wordChange} words`);
        }
      }

      lastNodeCount = metrics.nodeCount;
      lastWordCount = metrics.wordCount;
    }

    if (this.options.debug) {
      console.log(`[Phase4] Content stabilized: ${lastNodeCount} nodes, ${lastWordCount} words`);
    }
  }

  /**
   * Main entry point: Inline all images and SVGs to base64
   * Call this AFTER smartWaitForContent but BEFORE freezing
   */
  async inlineAllResources(page, baseUrl) {
    if (this.options.debug) {
      console.log('[Phase4] Starting resource inlining...');
    }

    // Step 1: Inline all images to base64
    await this._inlineImages(page, baseUrl);

    // Step 2: Process background images in CSS
    await this._inlineBackgroundImages(page, baseUrl);

    // Step 3: Inline SVGs (including <use> references)
    await this._inlineSVGs(page, baseUrl);

    // Step 4: Process CSS files for url() references
    await this._processCSSFiles(page, baseUrl);

    // Step 5: Wait for all conversions to complete
    await page.waitForTimeout(1000);

    if (this.options.debug) {
      console.log('[Phase4] Resource inlining complete:', this.stats);
    }

    return this.stats;
  }

  /**
   * Convert all <img> tags to base64 data URIs
   */
  async _inlineImages(page, baseUrl) {
    const stats = await page.evaluate(async ({ options, baseUrl }) => {
      const stats = { processed: 0, encoded: 0, failed: 0, bytes: 0 };

      const origin = new URL(baseUrl).origin;

      const toAbsolute = (url) => {
        if (!url) return null;
        if (url.startsWith('data:') || url.startsWith('blob:')) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return origin + url;
        return origin + '/' + url;
      };

      const toBase64 = (buffer, mimeType) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return 'data:' + mimeType + ';base64,' + btoa(binary);
      };

      const getMimeType = (url, blobType) => {
        if (blobType) return blobType;
        const ext = url.split('.').pop().toLowerCase().split('?')[0];
        const mimeMap = {
          'jpg': 'image/jpeg', 'jpeg': 'image/jpeg',
          'png': 'image/png', 'gif': 'image/gif',
          'svg': 'image/svg+xml', 'webp': 'image/webp',
          'avif': 'image/avif', 'bmp': 'image/bmp',
          'ico': 'image/x-icon', 'tiff': 'image/tiff'
        };
        return mimeMap[ext] || 'image/png';
      };

      // Get all images and limit them
      const images = Array.from(document.querySelectorAll('img')).slice(0, options.maxImages);
      if (options.debug) console.log(`[Phase4] Processing ${images.length} images (capped at ${options.maxImages})`);

      // Helper for fetch with timeout
      const fetchWithTimeout = async (url, timeout) => {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), timeout);
        try {
          const response = await fetch(url, { signal: controller.signal, mode: 'cors' });
          clearTimeout(id);
          return response;
        } catch (e) {
          clearTimeout(id);
          throw e;
        }
      };

      const processImage = async (img) => {
        try {
          const src = img.src;
          if (!src || src.startsWith('data:')) return;

          const absUrl = toAbsolute(src);
          if (!absUrl) return;

          stats.processed++;

          // Try fetch with timeout
          try {
            const response = await fetchWithTimeout(absUrl, options.fetchTimeout);
            if (!response.ok) throw new Error('Fetch failed: ' + response.status);

            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();

            // Check size limit
            if (arrayBuffer.byteLength > options.maxImageSize) {
              img.src = absUrl;
              img.removeAttribute('srcset');
              return;
            }

            const mimeType = getMimeType(src, blob.type);
            const base64 = toBase64(arrayBuffer, mimeType);

            img.src = base64;
            img.removeAttribute('srcset');
            img.removeAttribute('loading');

            stats.encoded++;
            stats.bytes += base64.length;
          } catch (fetchError) {
            // Fallback: use absolute URL
            img.src = absUrl;
            img.removeAttribute('srcset');
            stats.failed++;
          }
        } catch (e) {
          stats.failed++;
        }
      };

      // Process in batches for better performance
      const batchSize = options.concurrency;
      for (let i = 0; i < images.length; i += batchSize) {
        const batch = images.slice(i, i + batchSize);
        if (options.debug && i > 0) console.log(`[Phase4] Progressive inlining: ${i}/${images.length}...`);
        await Promise.all(batch.map(processImage));
      }

      return stats;
    }, { options: this.options, baseUrl });

    this.stats.imagesProcessed += stats.processed;
    this.stats.imagesBase64Encoded += stats.encoded;
    this.stats.imagesFailed += stats.failed;
    this.stats.totalBytesInlined += stats.bytes;
  }

  /**
   * Convert background images in CSS to base64
   */
  async _inlineBackgroundImages(page, baseUrl) {
    const stats = await page.evaluate(async ({ options, baseUrl }) => {
      const stats = { processed: 0, encoded: 0, failed: 0, bytes: 0 };

      const origin = new URL(baseUrl).origin;

      const toAbsolute = (url) => {
        if (!url) return null;
        if (url.startsWith('data:') || url.startsWith('blob:')) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return origin + url;
        return origin + '/' + url;
      };

      const toBase64 = (buffer, mimeType) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return 'data:' + mimeType + ';base64,' + btoa(binary);
      };

      // Filter elements that are likely to have background images (heuristics)
      const likelyElements = Array.from(document.querySelectorAll('div, section, header, footer, article, main, aside, [style*="background"]'));
      const selection = likelyElements.slice(0, 1000); // Only check 1000 elements max

      const elementsWithBg = [];
      for (const el of selection) {
        try {
          const style = window.getComputedStyle(el);
          const bgImage = style.backgroundImage;
          if (bgImage && bgImage !== 'none' && bgImage.includes('url(')) {
            elementsWithBg.push({
              element: el,
              bgImage: bgImage,
              urls: bgImage.match(/url\(["']?([^"')]+)["']?\)/g) || []
            });
          }
          if (elementsWithBg.length >= 50) break; // Cap background images to 50
        } catch (e) { continue; }
      }

      // Process each element
      for (const { element, urls } of elementsWithBg) {
        for (const match of urls) {
          const url = match.replace(/url\(["']?([^"')]+)["']?\)/, '$1');
          if (url.startsWith('data:')) continue;

          const absUrl = toAbsolute(url);
          if (!absUrl) continue;

          stats.processed++;

          try {
            const controller = new AbortController();
            const id = setTimeout(() => controller.abort(), options.fetchTimeout);
            const response = await fetch(absUrl, { signal: controller.signal, mode: 'cors' });
            clearTimeout(id);

            if (!response.ok) continue;

            const blob = await response.blob();
            const arrayBuffer = await blob.arrayBuffer();

            if (arrayBuffer.byteLength > options.maxBgImageSize) continue;

            const mimeType = blob.type || 'image/png';
            const base64 = toBase64(arrayBuffer, mimeType);

            // Update the background image CSS
            const oldStyle = element.getAttribute('style') || '';
            const newStyle = oldStyle.replace(url, base64);
            element.setAttribute('style', newStyle);

            stats.encoded++;
            stats.bytes += base64.length;
          } catch (e) {
            stats.failed++;
          }
        }
      }

      return stats;
    }, { options: this.options, baseUrl });

    this.stats.imagesProcessed += stats.processed;
    this.stats.imagesBase64Encoded += stats.encoded;
    this.stats.imagesFailed += stats.failed;
    this.stats.totalBytesInlined += stats.bytes;
  }

  /**
   * Inline SVGs - handle <use> tags and external SVG references
   */
  async _inlineSVGs(page, baseUrl) {
    const stats = await page.evaluate(async ({ options, baseUrl }) => {
      const stats = { svgsInlined: 0, svgsFailed: 0 };

      const origin = new URL(baseUrl).origin;

      const toAbsolute = (url) => {
        if (!url) return null;
        if (url.startsWith('data:')) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return origin + url;
        return origin + '/' + url;
      };

      // Process <use> tags
      const useTags = document.querySelectorAll('use');

      for (const use of useTags) {
        try {
          const href = use.getAttribute('href') || use.getAttribute('xlink:href');
          if (!href) continue;

          // Parse SVG reference (e.g., /sprites.svg#icon or #local-icon)
          let svgUrl, symbolId;

          if (href.startsWith('#')) {
            // Local reference - skip
            continue;
          } else if (href.includes('#')) {
            [svgUrl, symbolId] = href.split('#');
          } else {
            svgUrl = href;
          }

          const absSvgUrl = toAbsolute(svgUrl);
          if (!absSvgUrl) continue;

          const response = await fetch(absSvgUrl);
          if (!response.ok) {
            stats.svgsFailed++;
            continue;
          }

          const svgText = await response.text();

          // If there's a symbol ID, extract just that symbol
          if (symbolId) {
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const symbol = svgDoc.getElementById(symbolId);

            if (!symbol) {
              stats.svgsFailed++;
              continue;
            }

            // Create new inline SVG
            const newSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            newSvg.setAttribute('viewBox', symbol.getAttribute('viewBox') || '0 0 24 24');

            // Copy symbol contents
            newSvg.innerHTML = symbol.innerHTML;

            // Copy attributes from parent SVG if it exists
            const parentSvg = use.closest('svg');
            if (parentSvg) {
              ['width', 'height', 'class', 'style', 'fill', 'stroke'].forEach(attr => {
                const val = parentSvg.getAttribute(attr);
                if (val) newSvg.setAttribute(attr, val);
              });
            }

            // Replace the use element's parent SVG with inline version
            if (parentSvg && parentSvg.parentNode) {
              parentSvg.parentNode.replaceChild(newSvg, parentSvg);
              stats.svgsInlined++;
            }
          } else {
            // No symbol ID - inline the entire SVG
            const parser = new DOMParser();
            const svgDoc = parser.parseFromString(svgText, 'image/svg+xml');
            const svgElement = svgDoc.querySelector('svg');

            if (svgElement && use.parentNode) {
              // Copy attributes from original use element
              const parentSvg = use.closest('svg');
              if (parentSvg) {
                ['width', 'height', 'class', 'style'].forEach(attr => {
                  const val = parentSvg.getAttribute(attr);
                  if (val) svgElement.setAttribute(attr, val);
                });
              }

              use.parentNode.replaceChild(svgElement, use);
              stats.svgsInlined++;
            }
          }
        } catch (e) {
          stats.svgsFailed++;
        }
      }

      // Also inline external SVGs referenced via <img> or background-image
      // These should have been handled by _inlineImages and _inlineBackgroundImages
      // but we can do additional processing here if needed

      return stats;
    }, { options: this.options, baseUrl });

    this.stats.svgsInlined += stats.svgsInlined;
    this.stats.svgsFailed += stats.svgsFailed;
  }

  /**
   * Process CSS stylesheets to inline url() references
   */
  async _processCSSFiles(page, baseUrl) {
    await page.evaluate(async ({ options, baseUrl }) => {
      const origin = new URL(baseUrl).origin;

      const toAbsolute = (url) => {
        if (!url) return null;
        if (url.startsWith('data:') || url.startsWith('blob:')) return url;
        if (url.startsWith('http://') || url.startsWith('https://')) return url;
        if (url.startsWith('//')) return 'https:' + url;
        if (url.startsWith('/')) return origin + url;
        return new URL(url, baseUrl).href;
      };

      const toBase64 = (buffer, mimeType) => {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return 'data:' + mimeType + ';base64,' + btoa(binary);
      };

      // Process all inline styles that might have url() references
      const styleElements = document.querySelectorAll('style');

      for (const style of styleElements) {
        try {
          let cssText = style.textContent;
          const urlMatches = cssText.match(/url\(["']?([^"')]+)["']?\)/g);

          if (!urlMatches) continue;

          for (const match of urlMatches) {
            const url = match.replace(/url\(["']?([^"')]+)["']?\)/, '$1');
            if (url.startsWith('data:') || url.startsWith('#')) continue;

            const absUrl = toAbsolute(url);
            if (!absUrl) continue;

            try {
              const response = await fetch(absUrl, { mode: 'cors' });
              if (!response.ok) continue;

              const blob = await response.blob();
              const arrayBuffer = await blob.arrayBuffer();

              // Skip large files
              if (arrayBuffer.byteLength > options.maxBgImageSize) continue;

              const mimeType = blob.type || 'image/png';
              const base64 = toBase64(arrayBuffer, mimeType);

              // Replace in CSS
              cssText = cssText.replace(match, `url("${base64}")`);
            } catch (e) {
              // Keep original if fails
            }
          }

          style.textContent = cssText;
        } catch (e) {
          // Continue on error
        }
      }
    }, { options: this.options, baseUrl });

    this.stats.cssFilesProcessed++;
  }

  /**
   * Get current stats
   */
  getStats() {
    return { ...this.stats };
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = {
      imagesProcessed: 0,
      imagesBase64Encoded: 0,
      imagesFailed: 0,
      svgsInlined: 0,
      svgsFailed: 0,
      cssFilesProcessed: 0,
      totalBytesInlined: 0
    };
  }
}

module.exports = { Base64Inliner };
