/**
 * Resource Detector Module
 * Extracts all external resources (CSS, JS, images, fonts) from HTML
 */

class ResourceDetector {
  constructor() {
    // Resource type patterns
    this.patterns = {
      css: {
        regex: /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["']/gi,
        type: 'css'
      },
      js: {
        regex: /<script[^>]*src=["']([^"']+)["']/gi,
        type: 'js'
      },
      img: {
        regex: /<img[^>]*src=["']([^"']+)["']/gi,
        type: 'image'
      },
      imageSrcset: {
        regex: /imagesrcset=["']([^"']+)["']/gi,
        type: 'image-srcset'
      },
      preloadCss: {
        regex: /<link[^>]*rel=["']preload["'][^>]*as=["']style["'][^>]*href=["']([^"']+)["']/gi,
        type: 'css'
      },
      preloadJs: {
        regex: /<link[^>]*rel=["']preload["'][^>]*as=["']script["'][^>]*href=["']([^"']+)["']/gi,
        type: 'js'
      },
      video: {
        regex: /<video[^>]*src=["']([^"']+)["']/gi,
        type: 'video'
      },
      videoPoster: {
        regex: /<video[^>]*poster=["']([^"']+)["']/gi,
        type: 'image'
      },
      source: {
        regex: /<source[^>]*src=["']([^"']+)["']/gi,
        type: 'media'
      },
      pictureImg: {
        regex: /<picture[^>]*>.*?<img[^>]*src=["']([^"']+)["']/gis,
        type: 'image'
      }
    };
  }

  /**
   * Main detection method - extracts all resources from HTML
   */
  detect(html, baseUrl) {
    const resources = {
      css: [],
      js: [],
      images: [],
      fonts: [],
      media: [],
      other: []
    };

    const allUrls = new Set();

    // Extract URLs using patterns
    for (const [key, pattern] of Object.entries(this.patterns)) {
      const matches = this.extractMatches(html, pattern.regex);
      
      for (const url of matches) {
        if (url && !allUrls.has(url)) {
          allUrls.add(url);
          
          const resolvedUrl = this.resolveUrl(url, baseUrl);
          const resource = {
            originalUrl: url,
            resolvedUrl: resolvedUrl,
            type: pattern.type,
            category: this.categorizeResource(resolvedUrl, pattern.type)
          };

          // Add to appropriate category
          if (resources[resource.category]) {
            resources[resource.category].push(resource);
          } else {
            resources.other.push(resource);
          }
        }
      }
    }

    // Extract srcset images
    const srcsetImages = this.extractSrcsetImages(html, baseUrl);
    resources.images.push(...srcsetImages);

    // Extract inline style URLs
    const inlineUrls = this.extractInlineStyleUrls(html, baseUrl);
    for (const url of inlineUrls) {
      if (!allUrls.has(url.resolvedUrl)) {
        allUrls.add(url.resolvedUrl);
        resources.images.push(url);
      }
    }

    return {
      ...resources,
      summary: this.generateSummary(resources),
      baseUrl
    };
  }

  /**
   * Extract all matches from HTML using regex
   */
  extractMatches(html, regex) {
    const matches = [];
    let match;
    
    // Reset regex lastIndex
    regex.lastIndex = 0;
    
    while ((match = regex.exec(html)) !== null) {
      if (match[1]) {
        matches.push(match[1].trim());
      }
    }
    
    return matches;
  }

  /**
   * Extract individual image URLs from srcset attribute
   */
  extractSrcsetImages(html, baseUrl) {
    const images = [];
    const srcsetRegex = /srcset=["']([^"']+)["']/gi;
    let match;

    while ((match = srcsetRegex.exec(html)) !== null) {
      const srcset = match[1];
      // Parse srcset: "url1 1x, url2 2x, url3 3x"
      const urls = srcset.split(',').map(s => s.trim().split(' ')[0]);
      
      for (const url of urls) {
        if (url) {
          const resolvedUrl = this.resolveUrl(url, baseUrl);
          images.push({
            originalUrl: url,
            resolvedUrl: resolvedUrl,
            type: 'image-srcset',
            category: 'images'
          });
        }
      }
    }

    return images;
  }

  /**
   * Extract URLs from inline style attributes
   */
  extractInlineStyleUrls(html, baseUrl) {
    const urls = [];
    const styleRegex = /style=["']([^"']*)["']/gi;
    const urlRegex = /url\(["']?([^"')]+)["']?\)/gi;
    
    let styleMatch;
    while ((styleMatch = styleRegex.exec(html)) !== null) {
      const style = styleMatch[1];
      let urlMatch;
      
      while ((urlMatch = urlRegex.exec(style)) !== null) {
        const url = urlMatch[1];
        if (url && !url.startsWith('data:')) {
          const resolvedUrl = this.resolveUrl(url, baseUrl);
          urls.push({
            originalUrl: url,
            resolvedUrl: resolvedUrl,
            type: 'inline-style',
            category: 'images'
          });
        }
      }
    }
    
    return urls;
  }

  /**
   * Resolve relative URL to absolute
   */
  resolveUrl(url, baseUrl) {
    // Already absolute
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      if (url.startsWith('//')) {
        return 'https:' + url;
      }
      return url;
    }

    // Data URI
    if (url.startsWith('data:')) {
      return null; // Skip data URIs
    }

    // Hash-only or javascript
    if (url.startsWith('#') || url.startsWith('javascript:')) {
      return null;
    }

    try {
      const base = new URL(baseUrl);
      
      // Absolute path
      if (url.startsWith('/')) {
        return `${base.protocol}//${base.host}${url}`;
      }
      
      // Relative path
      const basePath = base.pathname.replace(/\/[^\/]*$/, '/');
      return `${base.protocol}//${base.host}${basePath}${url}`;
    } catch (e) {
      console.error(`Failed to resolve URL: ${url} with base: ${baseUrl}`);
      return null;
    }
  }

  /**
   * Categorize resource by type and extension
   */
  categorizeResource(url, defaultType) {
    if (!url) return 'other';
    
    const urlObj = new URL(url);
    const pathname = urlObj.pathname.toLowerCase();
    const extension = pathname.split('.').pop().split('?')[0];

    // Font extensions
    const fontExtensions = ['woff', 'woff2', 'ttf', 'otf', 'eot'];
    if (fontExtensions.includes(extension)) {
      return 'fonts';
    }

    // CSS
    if (extension === 'css' || defaultType === 'css') {
      return 'css';
    }

    // JS
    if (extension === 'js' || defaultType === 'js') {
      return 'js';
    }

    // Images
    const imageExtensions = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp'];
    if (imageExtensions.includes(extension) || defaultType === 'image' || defaultType === 'image-srcset') {
      return 'images';
    }

    // Video/Media
    const mediaExtensions = ['mp4', 'webm', 'ogg', 'mp3', 'wav'];
    if (mediaExtensions.includes(extension) || defaultType === 'video' || defaultType === 'media') {
      return 'media';
    }

    return 'other';
  }

  /**
   * Generate summary statistics
   */
  generateSummary(resources) {
    const summary = {};
    let total = 0;

    for (const [category, items] of Object.entries(resources)) {
      summary[category] = items.length;
      total += items.length;
    }

    summary.total = total;
    return summary;
  }
}

// Export for use in other modules
module.exports = ResourceDetector;

// CLI test
if (require.main === module) {
  const fs = require('fs');
  const path = require('path');

  const OUTPUT_DIR = path.join(__dirname, 'output');
  
  const testFiles = [
    { file: 'cmlabs.html', url: 'https://cmlabs.co' },
    { file: 'sequence.html', url: 'https://sequence.day' },
    { file: 'free_choice.html', url: 'https://react.dev' }
  ];

  console.log('🔍 Resource Detection Test\n');

  const detector = new ResourceDetector();

  for (const test of testFiles) {
    const filePath = path.join(OUTPUT_DIR, test.file);
    
    if (!fs.existsSync(filePath)) {
      console.log(`❌ ${test.file}: File not found`);
      continue;
    }

    const html = fs.readFileSync(filePath, 'utf-8');
    const result = detector.detect(html, test.url);

    console.log(`📄 ${test.file}:`);
    console.log(`   CSS: ${result.summary.css} files`);
    console.log(`   JS: ${result.summary.js} files`);
    console.log(`   Images: ${result.summary.images} files`);
    console.log(`   Fonts: ${result.summary.fonts} files`);
    console.log(`   Media: ${result.summary.media} files`);
    console.log(`   Other: ${result.summary.other} files`);
    console.log(`   Total: ${result.summary.total} resources\n`);
  }
}
