# CMLabs Backend Crawler

A robust web crawler designed for high-accuracy SPA (Single Page Application) and SSR (Server-Side Rendering) content extraction with visual similarity testing.

## 🚀 Architecture

The crawler uses a "back to basics" approach that prioritizes native browser behavior over fragile polyfills:

- **Native Asset Resolution**: Injects `<base href="...">` so the browser natively resolves relative CSS, images, and fonts without regex replacements.
- **Content De-Hydration**: Strips all `<script>` tags and preloads to prevent React/Vue from wiping the populated DOM when viewed offline.
- **Smart Lazy-Loading**: Smooth-scroll trigger for `IntersectionObserver` callbacks, ensuring below-the-fold content renders before capture.
- **Stabilization Suite**: Automatic cookie/modal dismissal, CSS animation freezing, and carousel resetting for deterministic visual results.
- **Non-Destructive Height Handling**: Visual comparator applies soft `min-height` constraints only to `html` and `body`, never to internal framework components — preventing Next.js flex layout collapse.

## 📊 Similarity Test Results

Threshold: **≥ 90% similarity** for all targets.

| Target Website | Type | Threshold | Result | Status |
| :--- | :--- | :--- | :--- | :--- |
| **Sequence.day** | SPA | 90% | **100.00%** | ✅ PASS |
| **React.dev** | SSR | 90% | **99.74%** | ✅ PASS |
| **Cmlabs.co** | SSR | 90% | **93.64%** | ✅ PASS |

## 🛠 Usage & Testing

### Installation
```bash
npm install
```

### Full E2E Workflow
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
├── crawler.js              # Core V5 Crawler
├── output/                 # Extracted HTML files
├── test/
│   ├── baselines/          # Live site snapshots (ground truth)
│   ├── crawled/            # Captured crawled output snapshots
│   ├── diffs/              # Visual diff images & similarity-report.json
│   └── similarity.test.js  # Standardized Jest test suite (≥90% threshold)
└── test/utils/
    ├── visual-comparator.js  # Screenshot capture & pixel diffing engine
    └── test-server.js        # Local HTTP server for crawled HTML serving
```

## License
ISC
