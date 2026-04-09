/**
 * Simplified Web Crawler
 * Complies rigidly with PRD requirements for SSR/SPA/PWA fetching.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

class Crawler {
  constructor(options = {}) {
    this.options = {
      outputDir: './output',
      headless: true,
      ...options
    };
    this.browser = null;
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
      // Critical: cmlabs.co shows a cookie consent dialog on first visit,
      // adding 'modal-open' + overflow:hidden to body, distorting page height
      await page.evaluate(() => {
        // Click common accept/close buttons
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
        // Remove persistent overlays
        document.querySelectorAll('[class*="cookie"], [class*="consent"], .modal-backdrop').forEach(el => el.remove());
        // Restore body scroll state (Bootstrap modal-open side effect)
        document.body.classList.remove('modal-open');
        document.body.style.removeProperty('overflow');
        document.body.style.removeProperty('padding-right');
        document.documentElement.style.removeProperty('overflow');
        // Remove visible modals
        document.querySelectorAll('.modal.show, [role="dialog"][aria-modal="true"]').forEach(el => el.remove());
      });
      await page.waitForTimeout(500);

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
      // This is native HTML magic that fixes all relative CSS/image paths
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
      // This strips scripts so opening the HTML locally doesn't cause React/Vue to wipe the DOM
      await page.evaluate(() => {
        document.querySelectorAll('script').forEach(el => el.remove());
        document.querySelectorAll('noscript').forEach(el => el.remove());
        document.querySelectorAll('link[as="script"]').forEach(el => el.remove());
        document.querySelectorAll('link[rel="modulepreload"]').forEach(el => el.remove());

        // Remove standard Next.js / React hydration hints
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

      // Extract the exact active DOM state natively without overrides
      const html = await page.content();

      this.saveToFile(url, html);

      return { url, html, size: html.length };
    } catch (error) {
      console.error(`   ❌ Failed to crawl ${url}:`, error.message);
      return { url, error: error.message };
    } finally {
      await context.close();
    }
  }

  saveToFile(url, html) {
    if (!fs.existsSync(this.options.outputDir)) {
      fs.mkdirSync(this.options.outputDir, { recursive: true });
    }
    const filename = this.urlToFilename(url);
    const filePath = path.join(this.options.outputDir, filename);
    fs.writeFileSync(filePath, html, 'utf-8');
    return filePath;
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
    console.log('🕷️ API-Compliant Web Crawler (V5)\n');
    console.log('='.repeat(60));

    const crawler = new Crawler({ headless: true });
    await crawler.init();

    for (const target of TARGETS) {
      console.log(`\n🌐 Crawling: ${target.name}`);
      console.log(`   URL: ${target.url}`);

      const result = await crawler.crawlPage(target.url);
      if (result.html) {

        // Rename if filename forces it to differ from default urlToFilename
        const defaultFilename = crawler.urlToFilename(target.url);
        if (defaultFilename !== target.filename) {
          const oldPath = path.join(crawler.options.outputDir, defaultFilename);
          const newPath = path.join(crawler.options.outputDir, target.filename);
          if (fs.existsSync(oldPath)) fs.renameSync(oldPath, newPath);
        }

        console.log(`   ✅ Saved: ${target.filename}`);
      }
    }

    await crawler.close();
    console.log('\n✅ Crawl Complete!');
  }

  runCLI().catch(console.error);
}
