/**
 * Lazy Load Fixer - Phase 2
 * Forces lazy-loaded images and content to load
 * Enhanced for dynamic SPAs with progressive content loading
 */

class LazyLoadFixer {
  constructor(options = {}) {
    this.options = {
      scrollStep: options.scrollStep || 800,
      scrollDelay: options.scrollDelay || 150,
      loadThreshold: options.loadThreshold || 15000,
      interceptIntersectionObserver: options.interceptIntersectionObserver !== false,
      stabilizationRounds: options.stabilizationRounds || 3,
      waitForNetworkIdle: options.waitForNetworkIdle !== false
    };
  }

  /**
   * Get script to inject into page for lazy load fixing
   */
  getFixScript() {
    return `
      (function() {
        // Track network activity
        let activeRequests = 0;
        let requestTimestamps = [];
        
        // Monitor fetch/XHR to detect when network is idle
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
          activeRequests++;
          requestTimestamps.push(Date.now());
          return originalFetch.apply(this, args).finally(() => {
            activeRequests--;
          });
        };
        
        const originalXHR = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(...args) {
          activeRequests++;
          requestTimestamps.push(Date.now());
          this.addEventListener('loadend', () => {
            activeRequests--;
          });
          return originalXHR.apply(this, args);
        };
        
        function waitForNetworkIdle(timeout = 1000) {
          return new Promise((resolve) => {
            let lastActivity = Date.now();
            const check = () => {
              if (activeRequests === 0 && (Date.now() - lastActivity) > timeout) {
                resolve();
              } else {
                if (activeRequests > 0) lastActivity = Date.now();
                setTimeout(check, 100);
              }
            };
            check();
          });
        }

        // Mark all images as eager to prevent lazy loading
        const markImagesEager = () => {
          document.querySelectorAll('img').forEach(img => {
            img.loading = 'eager';
            img.decoding = 'sync';
          });
        };
        markImagesEager();

        // Override IntersectionObserver to immediately trigger callbacks
        if (${this.options.interceptIntersectionObserver}) {
          const OriginalIO = window.IntersectionObserver;
          window.IntersectionObserver = function(callback, options) {
            const instance = new OriginalIO(callback, options);
            const originalObserve = instance.observe.bind(instance);
            instance.observe = function(target) {
              originalObserve(target);
              // Immediately trigger with isIntersecting: true
              setTimeout(() => {
                try {
                  callback([{
                    target: target,
                    isIntersecting: true,
                    intersectionRatio: 1,
                    boundingClientRect: target.getBoundingClientRect(),
                    intersectionRect: target.getBoundingClientRect(),
                    rootBounds: null
                  }], instance);
                } catch(e) {}
              }, 0);
            };
            return instance;
          };
        }

        // Force all lazy images to load - handle various lazy loading patterns
        const forceLazyImages = () => {
          // Handle data-src pattern
          document.querySelectorAll('img[data-src]').forEach(img => {
            if (img.dataset.src && !img.src) {
              img.src = img.dataset.src;
            }
            if (img.dataset.srcset && !img.srcset) {
              img.srcset = img.dataset.srcset;
            }
            // Also copy data-sizes if present
            if (img.dataset.sizes) {
              img.sizes = img.dataset.sizes;
            }
          });

          // Handle background images in various formats
          document.querySelectorAll('[data-bg], [data-background]').forEach(el => {
            const bg = el.dataset.bg || el.dataset.background;
            if (bg) {
              el.style.backgroundImage = 'url(' + bg + ')';
            }
          });

          // Handle srcset lazy loading
          document.querySelectorAll('img[data-srcset]').forEach(img => {
            if (img.dataset.srcset && !img.srcset) {
              img.srcset = img.dataset.srcset;
            }
          });

          // Mark all as eager
          document.querySelectorAll('img[loading="lazy"]').forEach(img => {
            img.loading = 'eager';
          });
          
          // Trigger load on visible images
          document.querySelectorAll('img').forEach(img => {
            if (img.complete === false) {
              try {
                img.dispatchEvent(new Event('load'));
              } catch(e) {}
            }
          });
        };
        
        forceLazyImages();

        // Progressive scroll with height stabilization detection
        let scrollPos = 0;
        let stableCount = 0;
        let lastHeight = 0;
        let stabilizationReached = false;
        const stabilizationRounds = ${this.options.stabilizationRounds};
        
        async function progressiveScroll() {
          // Get current page height
          const currentHeight = Math.max(
            document.body.scrollHeight, 
            document.documentElement.scrollHeight,
            document.body.offsetHeight,
            document.documentElement.offsetHeight
          );
          
          // Check if height is stable
          if (currentHeight === lastHeight) {
            stableCount++;
            if (stableCount >= stabilizationRounds && !stabilizationReached) {
              stabilizationReached = true;
            }
          } else {
            stableCount = 0;
            stabilizationReached = false;
          }
          lastHeight = currentHeight;
          
          // Continue scrolling or stop if stable
          scrollPos += ${this.options.scrollStep};
          
          if ((!stabilizationReached || scrollPos <= currentHeight) && 
              scrollPos <= ${this.options.loadThreshold}) {
            
            window.scrollTo(0, scrollPos);
            
            // Force images after each scroll
            forceLazyImages();
            markImagesEager();
            
            // Wait for network to be idle before next scroll
            await new Promise(resolve => setTimeout(resolve, ${this.options.scrollDelay}));
            
            // Additional wait for network idle (if enabled)
            if (${this.options.waitForNetworkIdle} && activeRequests > 0) {
              await waitForNetworkIdle(500);
            }
            
            // Continue scrolling
            progressiveScroll();
          } else {
            // Final pass - scroll back to top
            window.scrollTo(0, 0);
            
            // Wait and do final force
            setTimeout(() => {
              forceLazyImages();
              markImagesEager();
              
              // One more scroll to bottom and back to ensure all is loaded
              const finalHeight = Math.max(
                document.body.scrollHeight, 
                document.documentElement.scrollHeight
              );
              window.scrollTo(0, finalHeight);
              setTimeout(() => {
                window.scrollTo(0, 0);
              }, 200);
            }, 500);
          }
        }
        
        progressiveScroll();
      })();
    `;
  }

  /**
   * Apply lazy load fixes to a Playwright page
   */
  async fixPage(page) {
    await page.evaluate(this.getFixScript());
    
    // Wait for images to load
    await page.waitForFunction(() => {
      const images = document.querySelectorAll('img');
      for (const img of images) {
        if (!img.complete && img.loading === 'lazy') {
          return false;
        }
      }
      return true;
    }, { timeout: 5000 }).catch(() => {
      // Timeout is okay, continue anyway
    });
  }
}

module.exports = { LazyLoadFixer };
