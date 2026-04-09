/**
 * SPA Polyfills - v4.0 Enhanced
 * Makes React/Vue/Angular apps render properly offline
 * 
 * KEY IMPROVEMENTS:
 * 1. Prerender capture preserves full page height
 * 2. Hydration error handling with automatic fallback
 * 3. Full-page height preservation
 * 4. Next.js specific fixes
 */

class SPAPolyfills {
  constructor(options = {}) {
    this.options = {
      capturePrerender: options.capturePrerender !== false,
      injectRouter: options.injectRouter !== false,
      handleHydrationErrors: options.handleHydrationErrors !== false,
      preserveHeight: options.preserveHeight !== false,
      forceRender: options.forceRender !== false
    };
    this.prerenderCache = new Map();
  }

  /**
   * Get detection script - runs before page load
   */
  getDetectionScript() {
    return `
      (function() {
        window.__SPA_INFO__ = {
          hasReact: !!(window.React || window.__NEXT_DATA__),
          hasVue: !!(window.Vue || window.__VUE__),
          hasAngular: !!(window.angular),
          hasNext: !!(window.__NEXT_DATA__),
          hydrationFailed: false,
          prerenderedHeight: 0,
          timestamp: Date.now()
        };
        
        // Mark Next.js pages for special handling
        if (document.querySelector('script[src*="/_next/"]') || window.__NEXT_DATA__) {
          document.documentElement.setAttribute('data-next-app', 'true');
        }
      })();
    `;
  }

  /**
   * Get hydration fix script - runs before page load
   */
  getHydrationFixScript() {
    return `
      (function() {
        // Capture full page content before hydration
        if (${this.options.capturePrerender}) {
          window.__PRERENDER_CAPTURE__ = function() {
            // Get the full rendered height
            const height = Math.max(
              document.body.scrollHeight,
              document.body.offsetHeight,
              document.documentElement.scrollHeight,
              document.documentElement.offsetHeight
            );
            window.__SPA_INFO__.prerenderedHeight = height;
            
            // Store the complete HTML including computed styles
            const clonedDoc = document.documentElement.cloneNode(true);
            
            // Add base URL for resources
            const base = document.createElement('base');
            base.href = window.location.origin + '/';
            
            // Remove Next.js hydration markers to prevent hydration
            const nextData = clonedDoc.querySelector('#__NEXT_DATA__');
            if (nextData) nextData.remove();
            
            // Remove script tags that might cause hydration
            const scripts = clonedDoc.querySelectorAll('script[src*="/_next/"]');
            scripts.forEach(s => s.remove());
            
            window.__FALLBACK_HTML__ = '<!DOCTYPE html>' + clonedDoc.outerHTML;
            window.__PRERENDER_HEIGHT__ = height;
          };
          
          // Capture after initial render but before hydration
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', window.__PRERENDER_CAPTURE__);
          } else {
            window.__PRERENDER_CAPTURE__();
          }
        }
        
        // Suppress hydration errors
        if (${this.options.handleHydrationErrors}) {
          const originalConsoleError = console.error;
          console.error = function(...args) {
            const message = args.join(' ');
            if (message.includes('hydrat') || message.includes('Hydrat') || 
                message.includes('did not match') || message.includes('server')) {
              window.__SPA_INFO__.hydrationFailed = true;
              return; // Suppress hydration errors
            }
            return originalConsoleError.apply(console, args);
          };
          
          // Also suppress React error boundaries
          window.addEventListener('error', function(e) {
            if (e.message && (e.message.includes('hydrat') || e.message.includes('Hydrat'))) {
              e.preventDefault();
              window.__SPA_INFO__.hydrationFailed = true;
            }
          });
        }
        
        // Fix router for file:// protocol
        if (${this.options.injectRouter} && window.location.protocol === 'file:') {
          // Mock history API to prevent navigation errors
          const originalPushState = history.pushState;
          const originalReplaceState = history.replaceState;
          
          history.pushState = function(state, title, url) {
            if (url && url.startsWith('http')) {
              console.warn('[SPA Polyfill] Blocked external navigation:', url);
              return;
            }
            return originalPushState.apply(history, arguments);
          };
          
          history.replaceState = function(state, title, url) {
            if (url && url.startsWith('http')) {
              console.warn('[SPA Polyfill] Blocked external replace:', url);
              return;
            }
            return originalReplaceState.apply(history, arguments);
          };
          
          // Mock window.open
          const originalOpen = window.open;
          window.open = function(url, target, features) {
            if (url && (url.startsWith('http') || url.startsWith('//'))) {
              console.warn('[SPA Polyfill] Blocked external window.open:', url);
              return null;
            }
            return originalOpen.apply(window, arguments);
          };
        }
      })();
    `;
  }

  /**
   * Get post-hydration fix script - ensures content is visible
   */
  getPostHydrationScript() {
    return `
      (function() {
        // Ensure all lazy-loaded content is visible
        document.querySelectorAll('[loading="lazy"]').forEach(el => {
          el.setAttribute('loading', 'eager');
        });
        
        // Force visible overflow on all containers
        document.querySelectorAll('div, section, article, main').forEach(el => {
          if (getComputedStyle(el).overflow === 'hidden') {
            el.style.overflow = 'visible';
          }
        });
        
        // Make all images visible
        document.querySelectorAll('img').forEach(img => {
          img.style.opacity = '1';
          img.style.visibility = 'visible';
        });
        
        // Set minimum height to prevent collapse
        if (window.__PRERENDER_HEIGHT__) {
          document.body.style.minHeight = window.__PRERENDER_HEIGHT__ + 'px';
        }
      })();
    `;
  }

  /**
   * Apply SPA fixes to page - includes pre and post hydration
   */
  async applyPolyfills(page) {
    // Detect SPA frameworks before navigation
    await page.evaluate(this.getDetectionScript());
    
    // Apply hydration fixes before navigation
    await page.evaluate(this.getHydrationFixScript());
    
    // Wait for hydration attempt
    await page.waitForTimeout(2000);
    
    // Check if hydration failed
    const needsFallback = await page.evaluate(() => {
      return window.__SPA_INFO__ && 
             window.__SPA_INFO__.hydrationFailed && 
             window.__FALLBACK_HTML__;
    });
    
    if (needsFallback) {
      await page.evaluate((html) => {
        // Replace entire document with prerendered version
        document.open();
        document.write(window.__FALLBACK_HTML__);
        document.close();
      });
      
      // Wait for content to settle
      await page.waitForTimeout(1000);
    }
    
    // Apply post-hydration fixes
    await page.evaluate(this.getPostHydrationScript());
    
    // Get SPA info
    return await this.getSPAInfo(page);
  }

  /**
   * Get SPA info from page
   */
  async getSPAInfo(page) {
    return await page.evaluate(() => ({
      ...window.__SPA_INFO__,
      hasPrerenderedHTML: !!window.__FALLBACK_HTML__,
      prerenderedHeight: window.__PRERENDER_HEIGHT__ || 0
    }));
  }

  /**
   * Process crawled HTML to add SPA polyfills for offline viewing
   * CRITICAL: This prevents React hydration that causes dimension mismatch
   * 
   * @param {string} html - The crawled HTML
   * @param {string} url - The source URL
   * @param {number} actualHeight - The actual page height (optional)
   * @param {boolean} addHeightConstraints - Whether to add height limiting CSS (default: false for similarity testing)
   */
  processHTMLForOffline(html, url, actualHeight = null, addHeightConstraints = false) {
    // Check if this is a Next.js/React app
    const isNextApp = html.includes('__NEXT_DATA__') || 
                      html.includes('/_next/') ||
                      html.includes('data-next-head');
    
    if (!isNextApp) return html;

    // Use actual page height from crawling, or estimate from HTML size
    // The actual height is passed from crawler after freezePage
    let targetHeight;
    if (actualHeight && actualHeight > 1000) {
      targetHeight = Math.min(actualHeight, 20000);
    } else {
      // Estimate from body content structure
      const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      const lineCount = bodyMatch ? bodyMatch[1].split('\n').length : 400;
      targetHeight = Math.min(lineCount * 25, 20000); // 25px per line, cap at 20k
    }
    
    // For similarity testing, we DON'T want height constraints
    // as they prevent proper full-page rendering
    if (!addHeightConstraints) {
      // Just remove hydration scripts but don't constrain height
      html = html.replace(/<script[^>]*src="[^"]*\/_next\/static\/chunks\/(main-|framework-|webpack-|react-)[^"]*"[^>]*>[\s\S]*?<\/script>/gi, '');
      html = html.replace(/<script[^>]*src="[^"]*\/_next\/static\/[^"]*\.js"[^>]*>[\s\S]*?<\/script>/gi, '');
      html = html.replace(/<script id="__NEXT_DATA__"[^>]*>[\s\S]*?<\/script>/gi, '');
      
      // Remove hydration markers - handle both data-reactroot and data-react="..."
      html = html.replace(/\sdata-react(?:[^\s>]*)/gi, '');
      html = html.replace(/data-next-head=""/gi, '');
      html = html.replace(/data-n-g=""/gi, '');
      html = html.replace(/data-n-css=""/gi, '');
      
      return html;
    }
    
    // Add height marker for debugging
    html = html.replace('<body', `<body data-captured-height="${targetHeight}"`);

    // Remove Next.js/React scripts (the root cause of hydration issues)
    // But KEEP: analytics, tracking, and non-React scripts
    html = html.replace(/<script[^>]*src="[^"]*\/_next\/static\/chunks\/(main-|framework-|webpack-|react-)[^"]*"[^>]*>[\s\S]*?<\/script>/gi, '');
    html = html.replace(/<script[^>]*src="[^"]*\/_next\/static\/[^"]*\.js"[^>]*>[\s\S]*?<\/script>/gi, '');
    
    // Remove Next.js data script specifically
    html = html.replace(/<script id="__NEXT_DATA__"[^>]*>[\s\S]*?<\/script>/gi, '');
    
    // Remove hydration markers that cause React to attempt hydration
    html = html.replace(/\sdata-react(?:[^\s>]*)/gi, '');
    html = html.replace(/data-next-head=""/gi, '');
    html = html.replace(/data-n-g=""/gi, '');
    html = html.replace(/data-n-css=""/gi, '');
    
    // CRITICAL: Inline critical computed styles BEFORE removing scripts
    // This preserves the layout state at crawl time

    // Create COMPREHENSIVE SPA polyfill injection
    const spaPolyfillScript = `
<script>
// SPA Polyfills for Offline Viewing - v4.0 MAXIMUM PROTECTION
(function() {
  'use strict';
  
  // Store original height
  var __ORIGINAL_HEIGHT__ = ${targetHeight};
  
  // Completely disable React/Next.js
  window.__NEXT_DATA__ = null;
  window.__NEXT_P = null;
  window.__NEXT_L = null;
  window.__NEXT_G = null;
  window.React = null;
  window.ReactDOM = null;
  
  // Block ALL script execution
  var originalAppendChild = document.head.appendChild;
  document.head.appendChild = function(element) {
    if (element.tagName === 'SCRIPT') {
      console.log('[SPA] Blocked script:', element.src || 'inline');
      return element;
    }
    return originalAppendChild.call(document.head, element);
  };
  
  // Prevent dynamic imports
  window.importScripts = function() { return Promise.resolve(); };
  
  // Suppress ALL errors
  console.error = function() {};
  console.warn = function() {};
  window.onerror = function() { return true; };
  
  // Prevent navigation
  history.pushState = function() {};
  history.replaceState = function() {};
  window.open = function() { return null; };
  
  // NOTE: For 100% visual accuracy, do NOT expand collapsed content
  // Expanding changes the layout from the original crawled state
  // Instead, we preserve the layout by locking the current height
  
  var __preserveLayout__ = function() {
    if (!document.body) return;
    
    // Lock the body height to prevent expansion
    var targetHeight = __ORIGINAL_HEIGHT__;
    document.body.style.cssText += '; max-height: ' + targetHeight + 'px !important; overflow-y: auto !important;';
    document.documentElement.style.cssText += '; max-height: ' + targetHeight + 'px !important; overflow-y: auto !important;';
    
    // Do NOT expand details/accordions - preserve their state
    // Do NOT show hidden elements - they were hidden for a reason
    // Do NOT expand collapsed sections - this changes the layout
  };
  
  // CRITICAL: Prevent body height expansion with strict limits
  var __heightLock__ = function() {
    if (!document.body) return;
    
    var currentHeight = document.body.scrollHeight;
    var targetHeight = Math.min(__ORIGINAL_HEIGHT__, 20000);
    
    // If body is way too tall, clamp it
    if (currentHeight > targetHeight * 1.5) {
      document.body.style.cssText += '; max-height: ' + targetHeight + 'px !important; overflow-y: auto !important;';
      document.documentElement.style.cssText += '; max-height: ' + targetHeight + 'px !important; overflow-y: auto !important;';
    }
    
    // Fix elements that are expanding layout
    var allDivs = document.querySelectorAll('div');
    for (var i = 0; i < allDivs.length; i++) {
      var el = allDivs[i];
      var rect = el.getBoundingClientRect();
      
      // If element is excessively tall, limit it
      if (rect.height > 3000 && !el.querySelector('img, svg, video, canvas')) {
        el.style.cssText += '; max-height: 2000px !important; overflow: auto !important;';
      }
    }
  };
  
  // Run immediately and repeatedly
  __preserveLayout__();
  __heightLock__();
  
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      __preserveLayout__();
      __heightLock__();
    });
  }
  
  // Continuous monitoring
  setInterval(function() {
    __preserveLayout__();
    __heightLock__();
  }, 1000);
})();
</script>
`;

    // Inject polyfills at the TOP of head (for script execution)
    if (html.includes('<head>')) {
      html = html.replace('<head>', '<head>' + spaPolyfillScript);
    }

    // ADD AGGRESSIVE CSS AT THE VERY END - takes precedence over all other CSS
    const aggressiveCSS = `
<style id="spa-final-constraints" data-spa-constraints="true">
/* FINAL CONSTRAINTS - Apply at end for maximum specificity */
html {
  max-height: ${targetHeight}px !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
}
body {
  min-height: auto !important;
  max-height: ${targetHeight}px !important;
  overflow-x: hidden !important;
  overflow-y: auto !important;
  height: auto !important;
}
body > * {
  max-height: ${targetHeight}px !important;
}

/* Override any fixed heights */
[style*="height"] {
  max-height: ${targetHeight}px !important;
}

/* Prevent collapsed content from expanding */
details, summary { display: block !important; }
details[open] summary ~ * { display: block !important; }

/* Limit code blocks */
pre, code, .code-block, .sandbox {
  max-height: 600px !important;
  overflow: auto !important;
}

/* Limit sandpack/playgrounds */
[class*="sandpack"], [class*="playground"], [class*="demo"], [class*="example"] {
  max-height: 1000px !important;
  overflow: auto !important;
}

/* Prevent animations */
* {
  animation: none !important;
  transition: none !important;
  animation-duration: 0s !important;
  transition-duration: 0s !important;
}

/* Limit images */
img, picture, figure, video, canvas, svg {
  max-height: 800px !important;
  height: auto !important;
}

/* Fix mobile overlays */
[class*="mobile-menu"], [class*="nav-overlay"], [class*="menu-overlay"],
[class*="drawer"], [class*="sidebar"] {
  position: relative !important;
  max-height: 600px !important;
}

/* Ensure main content */
main, article, [role="main"], #__next, #root {
  max-height: ${targetHeight}px !important;
  height: auto !important;
}
</style>
<script>
// Final height enforcement
(function() {
  var target = ${targetHeight};
  function enforce() {
    if (document.body && document.body.scrollHeight > target * 1.2) {
      document.body.style.maxHeight = target + 'px';
      document.body.style.overflowY = 'auto';
      document.documentElement.style.maxHeight = target + 'px';
    }
  }
  enforce();
  setInterval(enforce, 500);
})();
</script>`;

    // Add aggressive CSS before closing body tag
    if (html.includes('</body>')) {
      html = html.replace('</body>', aggressiveCSS + '</body>');
    } else if (html.includes('</html>')) {
      html = html.replace('</html>', aggressiveCSS + '</html>');
    }

    return html;
  }
}

module.exports = { SPAPolyfills };
