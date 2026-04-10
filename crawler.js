/**
 * Simplified Web Crawler
 * Complies rigidly with PRD requirements for SSR/SPA/PWA fetching.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const beautify = require('js-beautify').html;

class Crawler {
  constructor(options = {}) {
    this.options = {
      outputDir: './output',
      headless: true,
      beautify: true,
      ...options
    };
    this.browser = null;
    this.results = [];
  }

  async init() {
    if (!this.browser) {
      this.browser = await chromium.launch({ headless: this.options.headless });
    }
    return this;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    this.generateManifest();
  }

  async crawl(urls) {
    await this.init();
    const urlList = Array.isArray(urls) ? urls : [urls];

    for (const url of urlList) {
      await this.crawlPage(url);
    }
    return this;
  }

  async crawlPage(url) {
    const context = await this.browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });

    const page = await context.newPage();

    try {
      // 1. Wait for hydration (networkidle) to ensure SPA content is painted
      await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });

      // 2. Scroll to load lazy content properly
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

            // Wait for stationary ticks before deciding we hit the real bottom
            if (totalHeight >= currentHeight && stationaryCount > 10) {
              clearInterval(timer);
              // Final stabilization: scroll to middle for a moment to trigger observers, then top
              window.scrollTo(0, document.body.scrollHeight / 2);
              setTimeout(() => {
                window.scrollTo(0, 0);
                resolve();
              }, 1000);
            }
          }, 200);
        });
      });

      // Wait for any new network requests triggered by scrolling to settle
      await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => { });

      // 3. Dismiss cookie/consent popups and clean up modals
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
      await page.waitForTimeout(1000);

      // 4. Freeze carousels and dynamic elements
      await page.evaluate(() => {
        document.querySelectorAll('.carousel').forEach(el => {
          el.removeAttribute('data-bs-ride');
          el.querySelectorAll('.carousel-item').forEach((item, idx) => {
            if (idx === 0) item.classList.add('active');
            else item.classList.remove('active');
          });
        });
      });

      // 5. Absolute Path Resolution (Inject <base>)
      const origin = new URL(url).origin;
      await page.evaluate((baseHref) => {
        let baseElement = document.querySelector('base');
        if (!baseElement) {
          baseElement = document.createElement('base');
          document.head.prepend(baseElement);
        }
        baseElement.href = baseHref;
      }, origin);

      // 4. De-Hydration (Anti-Wipe mechanisms)
      await page.evaluate(() => {
        document.querySelectorAll('script').forEach(el => el.remove());
        document.querySelectorAll('noscript').forEach(el => el.remove());
        document.querySelectorAll('link[as="script"]').forEach(el => el.remove());
        document.querySelectorAll('link[rel="modulepreload"]').forEach(el => el.remove());

        const nextData = document.getElementById('__NEXT_DATA__');
        if (nextData) nextData.remove();

        document.querySelectorAll('[data-reactroot], [data-n-head-ssr]').forEach(el => {
          el.removeAttribute('data-reactroot');
          el.removeAttribute('data-n-head-ssr');
        });

        let style = document.createElement('style');
        style.textContent = '*, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; }';
        document.head.appendChild(style);
      });

      const html = await page.content();
      const filePath = this.saveToFile(url, html);

      const result = {
        url,
        filePath,
        size: fs.statSync(filePath).size,
        timestamp: new Date().toISOString(),
        status: 'SUCCESS'
      };
      this.results.push(result);

      return result;
    } catch (error) {
      console.error(`   ❌ Failed to crawl ${url}:`, error.message);
      this.results.push({ url, status: 'FAILED', error: error.message, timestamp: new Date().toISOString() });
      return { url, error: error.message };
    } finally {
      await context.close();
    }
  }

  saveToFile(url, html) {
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }

    let content = html;
    if (this.options.beautify) {
      content = beautify(html, {
        indent_size: 2,
        indent_char: ' ',
        max_preserve_newlines: 1,
        unformatted: ['code', 'pre', 'em', 'strong', 'span'],
        indent_inner_html: true
      });
    }

    const filename = this.urlToFilename(url);
    const filePath = path.join(this.options.outputDir, filename);
    fs.writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  generateManifest() {
    const manifestPath = path.join(this.options.outputDir, 'manifest.json');
    const manifest = {
      crawler: "Advanced SPA/PWA Crawler V6",
      generatedAt: new Date().toISOString(),
      totalResults: this.results.length,
      results: this.results.map(r => ({
        name: path.basename(r.filePath || ''),
        url: r.url,
        size: r.size,
        status: r.status,
        timestamp: r.timestamp
      }))
    };
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`\n📋 Manifest generated: ${manifestPath}`);
  }

  urlToFilename(urlStr) {
    try {
      const urlObj = new URL(urlStr);
      let filename = urlObj.hostname.replace(/[^a-zA-Z0-9]/g, '_');
      if (urlObj.pathname && urlObj.pathname !== '/') {
        filename += urlObj.pathname.replace(/\\/ / g, '_').replace(/[^a-zA-Z0-9_]/g, '');
      }
      return filename + '.html';
    } catch (e) {
      return 'unknown.html';
    }
  }
}

module.exports = { Crawler };

// CLI execution
if (require.main === module) {
  const TARGETS = [
    { name: 'cmlabs', url: 'https://cmlabs.co', filename: 'cmlabs.html' },
    { name: 'sequence', url: 'https://sequence.day', filename: 'sequence.html' },
    { name: 'reactdev', url: 'https://react.dev', filename: 'free_choice.html' }
  ];

  async function runCLI() {
    console.log('🕷️ API-Compliant Web Crawler (V6 - Refined Structure)\n');
    console.log('='.repeat(60));

    const crawler = new Crawler({ headless: true, beautify: true });
    await crawler.init();

    for (const target of TARGETS) {
      console.log(`\n🌐 Crawling: ${target.name}`);
      console.log(`   URL: ${target.url}`);

      const result = await crawler.crawlPage(target.url);
      if (result.status === 'SUCCESS') {
        // Handle custom filenames from TARGETS
        const defaultFilename = crawler.urlToFilename(target.url);
        if (defaultFilename !== target.filename) {
          const oldPath = path.join(crawler.options.outputDir, defaultFilename);
          const newPath = path.join(crawler.options.outputDir, target.filename);
          if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
            // Update result for manifest
            result.filePath = newPath;
          }
        }
        console.log(`   ✅ Saved & Beautified: ${target.filename}`);
      }
    }

    await crawler.close();
    console.log('\n✅ Crawl Complete!');
  }

  runCLI().catch(console.error);
}
