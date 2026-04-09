# CMLabs Backend Crawler (V5)

An API-compliant, robust web crawler designed for high-accuracy SPA (Single Page Application) and SSR (Server-Side Rendering) content extraction. Adheres to strict DOM preservation requirements for offline viewing.

## 🚀 Architectural Excellence (V5)

The V5 "Back to Basics" architecture prioritizes native browser features and passive DOM preservation over fragile polyfills:

- **Native Asset Resolution**: Injects `<base href="...">` to allow the browser to natively resolve relative CSS, images, and fonts without destructive character replacements.
- **Content De-Hydration**: Strips all `<script>` tags and preloads to prevent React/Vue hydration from wiping the populated DOM when viewed offline.
- **Smart Lazy-Loading**: Automated smooth-scroll trigger for `IntersectionObserver` callbacks, ensuring below-the-fold content is rendered before capture.
- **Stabilization Suite**: Automatic cookie/modal dismissal, CSS animation freezing, and carousel resetting for deterministic similarity results.

## 📊 Final Similarity Results

Standardized threshold: **90% similarity** for all targets.

| Target Website | Type | Threshold | Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Sequence.day** | SPA | 90% | **99.64%** | ✅ PASS |
| **React.dev** | SSR | 90% | **93.85%** | ✅ PASS |
| **Cmlabs.co** | SSR | 90% | **90.80%** | ✅ PASS |

## 🛠 Usage & Testing

### Installation
```bash
npm install
```

### Full E2E Workflow
The safest way to verify the crawler is through the automated E2E pipeline which handles cleaning, crawling, baseline capture, and similarity analysis:
```bash
npm run e2e
```

### Manual Execution
```bash
npm run clean                    # Clean previous artifacts
npm run crawl                    # Crawl targets to output/
npm run baseline:capture         # Capture live site baselines
npm run test:similarity          # Run Jest similarity test
```

## 📂 Project Structure
```
├── crawler.js              # Optimized V5 Crawler
├── output/                # Extracted HTML files
├── test/
│   ├── baselines/         # Live site snapshots
│   ├── crawled/           # Captured crawled output snapshots
│   ├── diffs/             # Visual diff visualization
│   └── similarity.test.js # Standardized test suite (90% Threshold)
└── src/lib/               # Modular stabilization logic
```

## License
ISC
