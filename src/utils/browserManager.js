const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const AnonymizeUAPlugin = require('puppeteer-extra-plugin-anonymize-ua');
const UserAgent = require('user-agents');
const logger = require('./logger');
const fs = require('fs');
const path = require('path');

// Add stealth plugin and anonymize user agent
puppeteer.use(StealthPlugin());
puppeteer.use(AnonymizeUAPlugin());

class BrowserManager {
    constructor() {
        this.browser = null;
        this.page = null;
        this.userAgent = new UserAgent();
        this.cookiesPath = path.join(__dirname, '../../data/cookies.json');
        this.proxies = this.loadProxies();
        this.currentProxyIndex = 0;
        this.freshStart = process.env.FRESH_START === 'true'; // New option for fresh start
    }

    async clearStoredData() {
        try {
            // Delete cookies file
            if (fs.existsSync(this.cookiesPath)) {
                fs.unlinkSync(this.cookiesPath);
                logger.info('Cleared stored cookies');
            }

            // Clear browser cache and data if browser is running
            if (this.page) {
                // Clear cookies
                const cookies = await this.page.cookies();
                if (cookies.length > 0) {
                    await this.page.deleteCookie(...cookies);
                    logger.info('Cleared browser cookies');
                }

                // Clear localStorage and sessionStorage
                await this.page.evaluate(() => {
                    localStorage.clear();
                    sessionStorage.clear();
                });

                // Clear browser cache
                const client = await this.page.target().createCDPSession();
                await client.send('Network.clearBrowserCache');
                await client.send('Network.clearBrowserCookies');
                logger.info('Cleared browser cache and storage');
            }
        } catch (error) {
            logger.error('Error clearing stored data:', error);
        }
    }

    loadProxies() {
        if (process.env.USE_PROXY === 'true' && process.env.PROXY_LIST) {
            return process.env.PROXY_LIST.split(',').map(proxy => {
                const [host, port, username, password] = proxy.split(':');
                return { host, port: parseInt(port), username, password };
            });
        }
        return [];
    }

    getRandomProxy() {
        if (this.proxies.length === 0) return null;
        
        const proxy = this.proxies[this.currentProxyIndex];
        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxies.length;
        return proxy;
    }

    async launch(options = {}) {
        try {
            // Clear stored data for fresh start
            if (this.freshStart || options.freshStart) {
                logger.info('Starting fresh browser session - clearing stored data');
                await this.clearStoredData();
            }

            const proxy = this.getRandomProxy();
            const isHeadless = process.env.HEADLESS_MODE === 'true';
            
            const launchOptions = {
                headless: isHeadless,
                defaultViewport: isHeadless ? { width: 1920, height: 1080 } : null,
                devtools: !isHeadless, // Open devtools in non-headless mode
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-web-security',
                    '--no-first-run',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    // Fresh session args
                    ...(this.freshStart || options.freshStart ? [
                        '--incognito',
                        '--disable-extensions',
                        '--disable-plugins',
                        '--clear-token-service',
                        '--disable-background-networking'
                    ] : []),
                    // macOS specific args for visible browser
                    ...(isHeadless ? [] : [
                        '--new-window',
                        '--start-maximized',
                        '--disable-extensions-except',
                        '--load-extension',
                    ])
                ],
                ignoreDefaultArgs: ['--enable-automation'],
                ignoreHTTPSErrors: true,
                ...options
            };

            // Add proxy configuration if available
            if (proxy) {
                launchOptions.args.push(`--proxy-server=${proxy.host}:${proxy.port}`);
                logger.info(`Using proxy: ${proxy.host}:${proxy.port}`);
            }

            logger.info(`Launching browser with headless: ${isHeadless}`);
            logger.info(`Browser args: ${JSON.stringify(launchOptions.args)}`);
            
            this.browser = await puppeteer.launch(launchOptions);
            
            logger.info(`Browser launched successfully. Connected: ${this.browser.isConnected()}`);
            
            // Create a new page
            this.page = await this.browser.newPage();
            
            logger.info(`New page created successfully`);
            
            // Set a realistic viewport only in headless mode
            if (isHeadless) {
                await this.page.setViewport({
                    width: 1920,
                    height: 1080,
                    deviceScaleFactor: 1,
                });
            }

            // Set user agent
            const userAgent = this.userAgent.toString();
            await this.page.setUserAgent(userAgent);
            logger.info(`Set user agent: ${userAgent}`);

            // Set proxy authentication if credentials are provided
            if (proxy && proxy.username && proxy.password) {
                await this.page.authenticate({
                    username: proxy.username,
                    password: proxy.password
                });
            }

            // Load saved cookies only if not fresh start
            if (!this.freshStart && !options.freshStart) {
                await this.loadCookies();
            } else {
                logger.info('Skipping cookie loading for fresh start');
            }

            // Set additional headers to appear more human-like
            await this.page.setExtraHTTPHeaders({
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate, br',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1',
            });

            // Override navigator properties to avoid detection
            await this.page.evaluateOnNewDocument(() => {
                // Override the navigator.webdriver property
                Object.defineProperty(navigator, 'webdriver', {
                    get: () => undefined,
                });

                // Override navigator.languages property
                Object.defineProperty(navigator, 'languages', {
                    get: () => ['en-US', 'en'],
                });

                // Override navigator.plugins
                Object.defineProperty(navigator, 'plugins', {
                    get: () => [1, 2, 3, 4, 5],
                });

                // Mock chrome runtime
                window.chrome = {
                    runtime: {}
                };

                // Override permissions
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) =>
                    parameters.name === 'notifications'
                        ? Promise.resolve({ state: Cypress.denied })
                        : originalQuery(parameters);
            });

            // Set realistic timeout
            this.page.setDefaultTimeout(parseInt(process.env.BROWSER_TIMEOUT) || 30000);
            this.page.setDefaultNavigationTimeout(parseInt(process.env.NAVIGATION_TIMEOUT) || 30000);

            logger.info('Browser launched successfully');
            return this.browser;

        } catch (error) {
            logger.error('Failed to launch browser:', error);
            throw error;
        }
    }

    async saveCookies() {
        try {
            if (this.page) {
                const cookies = await this.page.cookies();
                fs.writeFileSync(this.cookiesPath, JSON.stringify(cookies, null, 2));
                logger.info('Cookies saved successfully');
            }
        } catch (error) {
            logger.error('Failed to save cookies:', error);
        }
    }

    async loadCookies() {
        try {
            if (fs.existsSync(this.cookiesPath)) {
                const cookies = JSON.parse(fs.readFileSync(this.cookiesPath, 'utf8'));
                await this.page.setCookie(...cookies);
                logger.info('Cookies loaded successfully');
            }
        } catch (error) {
            logger.error('Failed to load cookies:', error);
        }
    }

    async humanLikeDelay(min = 1000, max = 3000) {
        const delay = Math.random() * (max - min) + min;
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    async ensurePageReady() {
        try {
            if (!this.page || this.page.isClosed()) {
                logger.warn('Page is closed or detached, creating new page');
                if (this.browser && !this.browser.isConnected()) {
                    logger.warn('Browser disconnected, relaunching');
                    await this.launch();
                } else if (this.browser) {
                    this.page = await this.browser.newPage();
                    await this.setupPage();
                }
            }
            
            // Check if page is responsive
            await this.page.evaluate(() => document.readyState);
            return true;
        } catch (error) {
            logger.error('Page not ready, attempting to recover:', error);
            try {
                await this.launch();
                return true;
            } catch (launchError) {
                logger.error('Failed to recover page:', launchError);
                return false;
            }
        }
    }

    async setupPage() {
        // Set a realistic viewport
        await this.page.setViewport({
            width: 1920,
            height: 1080,
            deviceScaleFactor: 1,
        });

        // Set user agent
        const userAgent = this.userAgent.toString();
        await this.page.setUserAgent(userAgent);

        // Set additional headers
        await this.page.setExtraHTTPHeaders({
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
        });

        // Set realistic timeout
        this.page.setDefaultTimeout(parseInt(process.env.BROWSER_TIMEOUT) || 30000);
        this.page.setDefaultNavigationTimeout(parseInt(process.env.NAVIGATION_TIMEOUT) || 30000);
    }

    async humanLikeType(selector, text, options = {}) {
        await this.page.waitForSelector(selector);
        await this.page.click(selector);
        await this.humanLikeDelay(500, 1000);
        
        // Clear existing text
        await this.page.keyboard.down('Control');
        await this.page.keyboard.press('KeyA');
        await this.page.keyboard.up('Control');
        await this.page.keyboard.press('Backspace');
        
        // Type with human-like delays
        for (const char of text) {
            await this.page.keyboard.type(char);
            await this.humanLikeDelay(50, 150);
        }
    }

    async humanLikeClick(selector, options = {}) {
        await this.page.waitForSelector(selector);
        
        // Add some randomness to the click position
        const element = await this.page.$(selector);
        const box = await element.boundingBox();
        
        const x = box.x + Math.random() * box.width;
        const y = box.y + Math.random() * box.height;
        
        await this.page.mouse.move(x, y);
        await this.humanLikeDelay(100, 300);
        await this.page.mouse.click(x, y);
        await this.humanLikeDelay(500, 1000);
    }

    async scrollRandomly() {
        // Simulate human-like scrolling behavior
        const scrollDistance = Math.random() * 500 + 200;
        await this.page.evaluate((distance) => {
            window.scrollBy(0, distance);
        }, scrollDistance);
        await this.humanLikeDelay(1000, 2000);
    }

    async waitForLinkedInLoad() {
        try {
            // Wait for LinkedIn's main content to load
            await this.page.waitForSelector('[data-test-id], .global-nav, .feed-container', {
                timeout: 10000
            });
            await this.humanLikeDelay(2000, 4000);
        } catch (error) {
            logger.warn('LinkedIn load timeout, continuing anyway');
        }
    }

    async handleCaptcha() {
        try {
            // Check for CAPTCHA presence
            const captchaExists = await this.page.$('.captcha-container, .challenge-page') !== null;
            
            if (captchaExists) {
                logger.warn('CAPTCHA detected - manual intervention required');
                
                if (!process.env.HEADLESS_MODE || process.env.HEADLESS_MODE === 'false') {
                    console.log('Please solve the CAPTCHA manually and press Enter to continue...');
                    await new Promise(resolve => {
                        process.stdin.once('data', () => resolve());
                    });
                } else {
                    throw new Error('CAPTCHA detected in headless mode - cannot proceed');
                }
            }
        } catch (error) {
            logger.error('Error handling CAPTCHA:', error);
            throw error;
        }
    }

    async takeScreenshot(filename) {
        try {
            const screenshotsDir = path.join(__dirname, '../../screenshots');
            if (!fs.existsSync(screenshotsDir)) {
                fs.mkdirSync(screenshotsDir, { recursive: true });
            }
            
            const filepath = path.join(screenshotsDir, `${filename}_${Date.now()}.png`);
            await this.page.screenshot({ path: filepath, fullPage: true });
            logger.info(`Screenshot saved: ${filepath}`);
            return filepath;
        } catch (error) {
            logger.error('Failed to take screenshot:', error);
        }
    }

    async close() {
        try {
            await this.saveCookies();
            if (this.browser) {
                await this.browser.close();
                this.browser = null;
                this.page = null;
                logger.info('Browser closed successfully');
            }
        } catch (error) {
            logger.error('Error closing browser:', error);
        }
    }

    getPage() {
        return this.page;
    }

    getBrowser() {
        return this.browser;
    }
}

module.exports = BrowserManager;
