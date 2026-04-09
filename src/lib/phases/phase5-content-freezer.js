/**
 * Content Freezer - Phase 5
 * Freezes dynamic content (carousels, animations) to consistent state
 */

class ContentFreezer {
  constructor(options = {}) {
    this.options = {
      pauseAnimations: options.pauseAnimations !== false,
      pauseCarousels: options.pauseCarousels !== false,
      pauseVideos: options.pauseVideos !== false,
      expandAccordions: options.expandAccordions !== false,
      openDropdowns: options.openDropdowns !== false,
      snapshotDelay: options.snapshotDelay || 500
    };
  }

  /**
   * Get script to freeze dynamic content
   */
  getFreezeScript() {
    return `
      (function() {
        // Pause all CSS animations
        if (${this.options.pauseAnimations}) {
          const style = document.createElement('style');
          style.textContent = 
            '* { animation: none !important; transition: none !important; }' +
            '*::before { animation: none !important; }' +
            '*::after { animation: none !important; }';
          document.head.appendChild(style);
          
          // Pause GIFs by forcing reload as static
          document.querySelectorAll('img[src$=".gif"]').forEach(img => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0);
            img.src = canvas.toDataURL('image/png');
          });
        }
        
        // Pause carousels/sliders
        if (${this.options.pauseCarousels}) {
          // Swiper.js
          if (window.Swiper) {
            document.querySelectorAll('.swiper-container, [class*="swiper"]').forEach(el => {
              if (el.swiper) {
                el.swiper.autoplay.stop();
                el.swiper.slideTo(0, 0);
              }
            });
          }
          
          // Slick slider
          if (window.jQuery && jQuery.fn.slick) {
            jQuery('.slick-slider').slick('slickPause');
            jQuery('.slick-slider').slick('slickGoTo', 0);
          }
          
          // Owl Carousel
          if (window.jQuery && jQuery.fn.owlCarousel) {
            jQuery('.owl-carousel').trigger('stop.owl.autoplay');
            jQuery('.owl-carousel').trigger('to.owl.carousel', [0, 0]);
          }
          
          // Bootstrap Carousel
          if (window.jQuery && jQuery.fn.carousel) {
            jQuery('.carousel').carousel('pause');
          }
          
          // Generic carousel detection
          document.querySelectorAll('[class*="carousel"], [class*="slider"]').forEach(el => {
            // Stop auto-rotation by removing interval
            if (el.dataset.interval) {
              el.dataset.interval = 'false';
            }
            // Navigate to first slide
            const firstSlide = el.querySelector('[class*="slide"], [class*="item"]');
            if (firstSlide) {
              firstSlide.classList.add('active');
            }
          });
        }
        
        // Pause videos
        if (${this.options.pauseVideos}) {
          document.querySelectorAll('video').forEach(video => {
            video.pause();
            video.currentTime = 0;
          });
          
          // YouTube iframes
          document.querySelectorAll('iframe[src*="youtube"]').forEach(iframe => {
            const src = iframe.src;
            if (!src.includes('autoplay=0')) {
              iframe.src = src.replace('autoplay=1', 'autoplay=0') + (src.includes('?') ? '&' : '?') + 'autoplay=0';
            }
          });
        }
        
        // NOTE: For 100% visual accuracy, we do NOT expand accordions
        // Expanding them changes the layout from the original
        // Instead, we preserve their current state and capture computed styles
        
        // Only expand if explicitly requested (not for React.dev)
        if (${this.options.expandAccordions} && false) {
          // This code is disabled for perfect visual preservation
        }
        
        // For React.dev specifically: preserve collapsible state
        // Record current open/closed state as data attributes
        document.querySelectorAll('details').forEach(el => {
          el.setAttribute('data-details-open', el.open);
        });
        
        document.querySelectorAll('[aria-expanded]').forEach(el => {
          el.setAttribute('data-aria-expanded', el.getAttribute('aria-expanded'));
        });
        
        // Open dropdowns
        if (${this.options.openDropdowns}) {
          document.querySelectorAll('.dropdown-menu').forEach(el => {
            el.classList.add('show');
            el.style.display = 'block';
          });
          document.querySelectorAll('.dropdown-toggle').forEach(el => {
            el.setAttribute('aria-expanded', 'true');
          });
        }
        
        window.__CONTENT_FROZEN__ = true;
      })();
    `;
  }

  /**
   * Freeze content on Playwright page
   */
  async freezePage(page) {
    await page.evaluate(this.getFreezeScript());
    
    // Wait for freeze to take effect
    await page.waitForTimeout(this.options.snapshotDelay);
    
    // Scroll back to top
    await page.evaluate(() => window.scrollTo(0, 0));
    
    // Wait again for layout to settle
    await page.waitForTimeout(200);
  }

  /**
   * Check if content was frozen
   */
  async isFrozen(page) {
    return await page.evaluate(() => window.__CONTENT_FROZEN__ || false);
  }
}

module.exports = { ContentFreezer };
