# AI AGENT TASK DIRECTIVE: SPA/PWA WEB CRAWLER

## [CONTEXT]
You are an autonomous software engineer. Your task is to build a web crawler capable of rendering and extracting full HTML from Single Page Applications (SPA), Server-Side Rendered (SSR) apps, and Progressive Web Apps (PWA). Standard HTTP request libraries (like `axios` or `requests`) are forbidden for the crawling logic because they do not execute client-side JavaScript.

## [TECH STACK CONSTRAINTS]
* **Language:** JavaScript (Node.js)
* **Core Library:** `playwright` (Preferred) or `puppeteer` (Headless browser execution is MANDATORY).
* **Environment:** Cross-platform compatibility.

## [TARGET URLS]
1. `https://cmlabs.co` -> Output: `cmlabs.html`
2. `https://sequence.day` -> Output: `sequence.html`
3. `https://react.dev` -> Output: `free_choice.html`

## [EXECUTION STEPS]

### Step 1: Project Initialization
* Initialize a new Node.js project (`npm init -y`).
* Install the required headless browser dependency (`npm install playwright` or `npm install puppeteer`).
* Create a `.gitignore` file. Ensure `node_modules/` and `output/` are ignored.

### Step 2: Crawler Logic Implementation (`crawler.js`)
* Create a script that iterates through the Target URLs.
* **Mandatory Browser Config:** Run the browser in `headless: true` mode. Inject a standard modern `User-Agent` to avoid basic bot detection.
* **Wait Condition (CRITICAL):** For each URL, the agent MUST wait until JavaScript has fully hydrated the DOM. Use conditions like `waitUntil: 'networkidle'` (Playwright) or `waitUntil: 'networkidle0'` (Puppeteer) with a fallback timeout of `60000` (60 seconds).
* **Extraction:** Extract the fully rendered `outerHTML` or `content()` of the document.
* **Error Handling:** Wrap the navigation and extraction in a `try/catch` block. If a single URL fails, log the error and continue to the next URL. Ensure the browser instance is strictly closed in a `finally` block to prevent memory leaks.

### Step 3: File System Operations
* Ensure the script automatically creates an `./output` directory in the root folder if it does not already exist.
* Write the extracted HTML strings into their respective `.html` files inside the `./output` directory.

### Step 4: Version Control Preparation
* Initialize a git repository (`git init`).
* Stage all files (`git add .`) excluding those in `.gitignore`.
* Create an initial commit: `git commit -m "feat: implement headless browser crawler for SPA/PWA"`.
* *Note: Do not attempt to push to a remote repository unless explicitly provided with a GitHub PAT (Personal Access Token) or SSH key. Stop at the commit stage.*

## [DEFINITION OF DONE (DoD)]
- [ ] `package.json` exists with required dependencies.
- [ ] `crawler.js` exists and contains headless browser logic.
- [ ] Running `node crawler.js` successfully creates `./output/cmlabs.html`, `./output/sequence.html`, and `./output/free_choice.html`.
- [ ] The generated HTML files contain the full DOM elements (not just empty `<div id="root"></div>` tags).
- [ ] `.gitignore` is present and functional.

## [EXECUTE]
Begin writing the code and setting up the workspace based on these directives. Stop and ask for clarification only if you encounter an environment blockage.