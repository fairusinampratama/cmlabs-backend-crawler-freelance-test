/**
 * Resource Inliner - Phase 1
 * Inlines external CSS, images, and fonts into HTML for offline viewing
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

class ResourceInliner {
  constructor(options = {}) {
    this.options = {
      maxCssSize: options.maxCssSize || 500000,      // 500KB - increased for Next.js
      maxImageSize: options.maxImageSize || 50000,   // 50KB
      maxFontSize: options.maxFontSize || 100000,    // 100KB
      inlineCss: options.inlineCss !== false,        // Default true
      inlineImages: options.inlineImages !== false,    // Default true
      inlineFonts: options.inlineFonts !== false,      // Default true
      timeout: options.timeout || 10000              // 10s fetch timeout
    };
    this.stats = {
      cssInlined: 0,
      imagesInlined: 0,
      fontsInlined: 0,
      cssSkipped: 0,
      imagesSkipped: 0,
      fontsSkipped: 0,
      errors: []
    };
  }

  /**
   * Main entry point - inline all resources in HTML
   */
  async inlineResources(html, baseUrl) {
    let result = html;
    
    try {
      // Phase 1: Inline CSS
      if (this.options.inlineCss) {
        result = await this.inlineStylesheets(result, baseUrl);
      }
      
      // Phase 2: Inline Images
      if (this.options.inlineImages) {
        result = await this.inlineImages(result, baseUrl);
      }
      
      // Phase 3: Inline Fonts (handled within CSS)
      if (this.options.inlineFonts) {
        result = await this.inlineFonts(result, baseUrl);
      }
      
    } catch (error) {
      this.stats.errors.push({ phase: 'general', error: error.message });
    }
    
    return result;
  }

  /**
   * Inline external stylesheets
   */
  async inlineStylesheets(html, baseUrl) {
    const linkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
    const links = [];
    let match;
    
    while ((match = linkRegex.exec(html)) !== null) {
      links.push({
        fullTag: match[0],
        href: match[1]
      });
    }
    
    let result = html;
    
    for (const link of links) {
      try {
        const absoluteUrl = this.resolveUrl(link.href, baseUrl);
        const cssContent = await this.fetchResource(absoluteUrl);
        
        if (!cssContent) {
          this.stats.cssSkipped++;
          continue;
        }
        
        // Check size limit
        if (cssContent.length > this.options.maxCssSize) {
          this.stats.cssSkipped++;
          continue;
        }
        
        // Process @import rules recursively
        const processedCss = await this.processCssImports(cssContent, absoluteUrl);
        
        // Replace link tag with style tag
        const styleTag = `<style>\n/* Inlined from: ${link.href} */\n${processedCss}\n</style>`;
        result = result.replace(link.fullTag, styleTag);
        
        this.stats.cssInlined++;
        
      } catch (error) {
        this.stats.errors.push({ phase: 'css', url: link.href, error: error.message });
        this.stats.cssSkipped++;
      }
    }
    
    return result;
  }

  /**
   * Process @import rules in CSS recursively
   */
  async processCssImports(css, baseUrl) {
    const importRegex = /@import\s+(?:url\()?["']([^"']+)["']\)?[^;]*;/gi;
    let result = css;
    let match;
    
    const imports = [];
    while ((match = importRegex.exec(css)) !== null) {
      imports.push({
        fullRule: match[0],
        url: match[1]
      });
    }
    
    for (const imp of imports) {
      try {
        const absoluteUrl = this.resolveUrl(imp.url, baseUrl);
        const importedCss = await this.fetchResource(absoluteUrl);
        
        if (importedCss && importedCss.length <= this.options.maxCssSize) {
          // Recursively process nested imports
          const processedImportedCss = await this.processCssImports(importedCss, absoluteUrl);
          result = result.replace(imp.fullRule, `\n/* Inlined import: ${imp.url} */\n${processedImportedCss}\n`);
        }
      } catch (error) {
        this.stats.errors.push({ phase: 'css-import', url: imp.url, error: error.message });
      }
    }
    
    return result;
  }

  /**
   * Inline images as base64 data URIs
   */
  async inlineImages(html, baseUrl) {
    let result = html;
    
    // Handle srcset images - pick the best size and replace srcset
    result = await this.inlineSrcsetImages(result, baseUrl);
    
    // Handle regular img src
    const imgRegex = /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;
    const images = [];
    let match;
    
    while ((match = imgRegex.exec(html)) !== null) {
      // Skip data URIs and external images
      const src = match[1];
      if (src.startsWith('data:') || src.startsWith('blob:')) {
        continue;
      }
      
      images.push({
        fullTag: match[0],
        src: src
      });
    }
    
    for (const img of images) {
      try {
        const absoluteUrl = this.resolveUrl(img.src, baseUrl);
        const imageData = await this.fetchResource(absoluteUrl, true);
        
        if (!imageData) {
          this.stats.imagesSkipped++;
          continue;
        }
        
        // Check size limit - increased for better quality retention
        if (imageData.length > this.options.maxImageSize * 2) { // Allow larger images
          this.stats.imagesSkipped++;
          continue;
        }
        
        // Convert to base64
        const base64Data = imageData.toString('base64');
        const mimeType = this.getImageMimeType(img.src);
        const dataUri = `data:${mimeType};base64,${base64Data}`;
        
        // Replace src attribute
        const newTag = img.fullTag.replace(img.src, dataUri);
        result = result.replace(img.fullTag, newTag);
        
        this.stats.imagesInlined++;
        
      } catch (error) {
        this.stats.errors.push({ phase: 'image', url: img.src, error: error.message });
        this.stats.imagesSkipped++;
      }
    }
    
    return result;
  }

  /**
   * Inline srcset images - replace srcset with single best image
   */
  async inlineSrcsetImages(html, baseUrl) {
    const srcsetRegex = /srcset=["']([^"']+)["']/gi;
    let result = html;
    let match;
    
    const srcsets = [];
    while ((match = srcsetRegex.exec(html)) !== null) {
      srcsets.push({
        fullMatch: match[0],
        srcset: match[1]
      });
    }
    
    for (const srcset of srcsets) {
      try {
        // Parse srcset and pick best candidate (largest reasonable size)
        const candidates = this.parseSrcset(srcset.srcset);
        if (candidates.length === 0) continue;
        
        // Pick a medium-large candidate (not the smallest, not necessarily the largest)
        const bestCandidate = candidates[Math.floor(candidates.length / 2)];
        
        const absoluteUrl = this.resolveUrl(bestCandidate.url, baseUrl);
        const imageData = await this.fetchResource(absoluteUrl, true);
        
        if (!imageData || imageData.length > this.options.maxImageSize * 2) {
          continue;
        }
        
        const base64Data = imageData.toString('base64');
        const mimeType = this.getImageMimeType(bestCandidate.url);
        const dataUri = `data:${mimeType};base64,${base64Data}`;
        
        // Replace srcset with single inlined src
        const newSrc = `src="${dataUri}"`;
        result = result.replace(srcset.fullMatch, newSrc);
        
        this.stats.imagesInlined++;
        
      } catch (error) {
        this.stats.errors.push({ phase: 'srcset', error: error.message });
      }
    }
    
    return result;
  }

  /**
   * Parse srcset attribute into candidates
   */
  parseSrcset(srcset) {
    const candidates = [];
    const parts = srcset.split(',');
    
    for (const part of parts) {
      const trimmed = part.trim();
      const match = trimmed.match(/^(.+)\s+(\d+w|\d+x)$/);
      if (match) {
        candidates.push({
          url: match[1].trim(),
          descriptor: match[2]
        });
      } else if (trimmed) {
        // No descriptor, just URL
        candidates.push({
          url: trimmed,
          descriptor: '1x'
        });
      }
    }
    
    return candidates;
  }

  /**
   * Inline fonts referenced in CSS
   */
  async inlineFonts(html, baseUrl) {
    // Find CSS blocks
    const styleRegex = /<style[^>]*>([\s\S]*?)<\/style>/gi;
    let result = html;
    let match;
    
    while ((match = styleRegex.exec(html)) !== null) {
      const originalCss = match[1];
      const processedCss = await this.processFontFaces(originalCss, baseUrl);
      
      if (processedCss !== originalCss) {
        result = result.replace(match[0], `<style>${processedCss}</style>`);
      }
    }
    
    return result;
  }

  /**
   * Process @font-face rules and inline font files
   */
  async processFontFaces(css, baseUrl) {
    const fontFaceRegex = /@font-face\s*{([^}]*)}/gi;
    const urlRegex = /url\(["']?([^"')]+)["']?\)/gi;
    
    let result = css;
    let fontFaceMatch;
    
    while ((fontFaceMatch = fontFaceRegex.exec(css)) !== null) {
      const fontFaceBlock = fontFaceMatch[0];
      const fontFaceContent = fontFaceMatch[1];
      
      let processedBlock = fontFaceBlock;
      let urlMatch;
      
      while ((urlMatch = urlRegex.exec(fontFaceContent)) !== null) {
        const fontUrl = urlMatch[1];
        
        // Skip data URIs
        if (fontUrl.startsWith('data:')) {
          continue;
        }
        
        try {
          const absoluteUrl = this.resolveUrl(fontUrl, baseUrl);
          const fontData = await this.fetchResource(absoluteUrl, true);
          
          if (!fontData) {
            this.stats.fontsSkipped++;
            continue;
          }
          
          // Check size limit
          if (fontData.length > this.options.maxFontSize) {
            this.stats.fontsSkipped++;
            continue;
          }
          
          // Convert to base64
          const base64Data = fontData.toString('base64');
          const mimeType = this.getFontMimeType(fontUrl);
          const dataUri = `data:${mimeType};base64,${base64Data}`;
          
          processedBlock = processedBlock.replace(fontUrl, dataUri);
          this.stats.fontsInlined++;
          
        } catch (error) {
          this.stats.errors.push({ phase: 'font', url: fontUrl, error: error.message });
          this.stats.fontsSkipped++;
        }
      }
      
      result = result.replace(fontFaceBlock, processedBlock);
    }
    
    return result;
  }

  /**
   * Fetch a resource from URL
   */
  fetchResource(url, asBuffer = false) {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url);
      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const request = client.get(url, { timeout: this.options.timeout }, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.fetchResource(redirectUrl, asBuffer).then(resolve).catch(reject);
            return;
          }
        }
        
        if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}`));
          return;
        }
        
        const chunks = [];
        
        response.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        response.on('end', () => {
          const data = Buffer.concat(chunks);
          
          if (asBuffer) {
            resolve(data);
          } else {
            resolve(data.toString('utf-8'));
          }
        });
        
        response.on('error', (error) => {
          reject(error);
        });
      });
      
      request.on('error', (error) => {
        reject(error);
      });
      
      request.on('timeout', () => {
        request.destroy();
        reject(new Error('Request timeout'));
      });
    });
  }

  /**
   * Resolve relative URL to absolute
   */
  resolveUrl(url, baseUrl) {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      return url;
    }
    
    if (url.startsWith('//')) {
      const baseProtocol = new URL(baseUrl).protocol;
      return `${baseProtocol}${url}`;
    }
    
    return new URL(url, baseUrl).href;
  }

  /**
   * Get MIME type for image
   */
  getImageMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'webp': 'image/webp',
      'ico': 'image/x-icon'
    };
    return mimeTypes[ext] || 'image/png';
  }

  /**
   * Get MIME type for font
   */
  getFontMimeType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const mimeTypes = {
      'woff2': 'font/woff2',
      'woff': 'font/woff',
      'ttf': 'font/ttf',
      'otf': 'font/otf',
      'eot': 'application/vnd.ms-fontobject'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Get stats about inlining operations
   */
  getStats() {
    return {
      ...this.stats,
      totalInlined: this.stats.cssInlined + this.stats.imagesInlined + this.stats.fontsInlined,
      totalSkipped: this.stats.cssSkipped + this.stats.imagesSkipped + this.stats.fontsSkipped
    };
  }

  /**
   * Reset stats
   */
  resetStats() {
    this.stats = {
      cssInlined: 0,
      imagesInlined: 0,
      fontsInlined: 0,
      cssSkipped: 0,
      imagesSkipped: 0,
      fontsSkipped: 0,
      errors: []
    };
  }
}

module.exports = { ResourceInliner };
