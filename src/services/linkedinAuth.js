const BrowserManager = require('../utils/browserManager');
const logger = require('../utils/logger');

class LinkedInAuth {
    constructor() {
        this.browserManager = new BrowserManager();
        this.isLoggedIn = false;
        this.loginUrl = 'https://www.linkedin.com/login';
        this.homeUrl = 'https://www.linkedin.com/feed/';
    }

    async login(email = null, password = null) {
        try {
            const loginEmail = email || process.env.LINKEDIN_EMAIL;
            const loginPassword = password || process.env.LINKEDIN_PASSWORD;

            if (!loginEmail || !loginPassword) {
                throw new Error('LinkedIn credentials not provided');
            }

            logger.info('Starting LinkedIn login process');
            
            // Launch browser
            await this.browserManager.launch();
            await this.browserManager.setupPage();
            const page = this.browserManager.getPage();

            // Navigate to login page with retry
            let retries = 3;
            while (retries > 0) {
                try {
                    await page.goto(this.loginUrl, { 
                        waitUntil: 'networkidle2',
                        timeout: 30000 
                    });
                    break;
                } catch (error) {
                    retries--;
                    if (retries === 0) throw error;
                    logger.warn(`Navigation failed, retrying... (${retries} attempts left)`);
                    await this.browserManager.humanLikeDelay(2000, 4000);
                }
            }

            await this.browserManager.humanLikeDelay(2000, 4000);

            // Check if already logged in
            if (await this.checkIfLoggedIn()) {
                logger.info('Already logged in to LinkedIn');
                this.isLoggedIn = true;
                return true;
            }

            // Fill in login credentials
            logger.info('Filling login credentials');
            await this.browserManager.humanLikeType('#username', loginEmail);
            await this.browserManager.humanLikeDelay(1000, 2000);
            
            await this.browserManager.humanLikeType('#password', loginPassword);
            await this.browserManager.humanLikeDelay(1000, 2000);

            // Click login button
            await this.browserManager.humanLikeClick('button[type="submit"]');
            logger.info('Login button clicked');

            // Wait for navigation or challenge
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 });
            await this.browserManager.humanLikeDelay(3000, 5000);

            // Handle potential challenges
            await this.handleLoginChallenges();

            // Navigate to LinkedIn feed first (important step)
            logger.info('Navigating to LinkedIn feed after login');
            await page.goto(this.homeUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await this.browserManager.humanLikeDelay(2000, 4000);

            // Verify login success
            if (await this.checkIfLoggedIn()) {
                logger.info('Successfully logged in to LinkedIn and reached feed');
                this.isLoggedIn = true;
                await this.browserManager.saveCookies();
                return true;
            } else {
                throw new Error('Login verification failed');
            }

        } catch (error) {
            logger.error('LinkedIn login failed:', error);
            await this.browserManager.takeScreenshot('login_error');
            throw error;
        }
    }

    async checkIfLoggedIn() {
        try {
            const page = this.browserManager.getPage();
            
            // Check for login indicators
            const loginIndicators = [
                '.global-nav__me',
                '[data-test-id="nav-global-me"]',
                '.feed-container',
                '.global-nav__primary-link--me'
            ];

            for (const selector of loginIndicators) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    logger.info('Login indicator found:', selector);
                    return true;
                } catch {
                    continue;
                }
            }

            // Check current URL
            const currentUrl = page.url();
            if (currentUrl.includes('/feed/') || currentUrl.includes('/in/')) {
                logger.info('Logged in based on URL:', currentUrl);
                return true;
            }

            return false;
        } catch (error) {
            logger.error('Error checking login status:', error);
            return false;
        }
    }

    async handleLoginChallenges() {
        try {
            const page = this.browserManager.getPage();
            await this.browserManager.humanLikeDelay(2000, 3000);

            // Check for "Let's do a quick verification" page
            const verificationText = await page.$('text="Let\'s do a quick verification"');
            const verificationPage = await page.$('input[placeholder*="Enter code"], input[placeholder*="verification"]');
            
            if (verificationText || verificationPage) {
                logger.warn('Email verification challenge detected - LinkedIn is asking for verification code');
                console.log('\n🔐 LINKEDIN EMAIL VERIFICATION REQUIRED:');
                console.log('1. Check your email: adityadwic.qa@gmail.com');
                console.log('2. Find LinkedIn verification email');
                console.log('3. Enter the verification code in the browser');
                console.log('4. Press Enter here when done...\n');
                
                if (!process.env.HEADLESS_MODE || process.env.HEADLESS_MODE === 'false') {
                    await new Promise(resolve => {
                        process.stdin.once('data', () => {
                            console.log('✅ Continuing with automation...');
                            resolve();
                        });
                    });
                } else {
                    logger.error('Email verification required in headless mode - cannot proceed');
                    throw new Error('Email verification required');
                }
            }

            // Handle email verification challenge (alternative selectors)
            const emailChallenge = await page.$('.challenge-form, .verification-page, .challenge-container');
            if (emailChallenge) {
                logger.warn('Email verification challenge detected (alternative)');
                
                if (!process.env.HEADLESS_MODE || process.env.HEADLESS_MODE === 'false') {
                    console.log('Please complete email verification manually and press Enter to continue...');
                    await new Promise(resolve => {
                        process.stdin.once('data', () => resolve());
                    });
                } else {
                    logger.error('Email verification required in headless mode - cannot proceed');
                    throw new Error('Email verification required');
                }
            }

            // Handle CAPTCHA
            await this.browserManager.handleCaptcha();

            // Handle phone verification
            const phoneChallenge = await page.$('.phone-verification');
            if (phoneChallenge) {
                logger.warn('Phone verification challenge detected');
                
                if (!process.env.HEADLESS_MODE || process.env.HEADLESS_MODE === 'false') {
                    console.log('Please complete phone verification manually and press Enter to continue...');
                    await new Promise(resolve => {
                        process.stdin.once('data', () => resolve());
                    });
                } else {
                    throw new Error('Phone verification required');
                }
            }

            // Handle PIN entry
            const pinChallenge = await page.$('.challenge-pin');
            if (pinChallenge) {
                logger.warn('PIN challenge detected');
                
                if (!process.env.HEADLESS_MODE || process.env.HEADLESS_MODE === 'false') {
                    console.log('Please enter the PIN manually and press Enter to continue...');
                    await new Promise(resolve => {
                        process.stdin.once('data', () => resolve());
                    });
                } else {
                    throw new Error('PIN verification required');
                }
            }

            // Wait for any redirects after challenge completion
            await this.browserManager.humanLikeDelay(3000, 5000);
            
        } catch (error) {
            logger.error('Error handling login challenges:', error);
            throw error;
        }
    }

    async navigateToJobs() {
        try {
            if (!this.isLoggedIn) {
                throw new Error('Not logged in to LinkedIn');
            }

            const page = this.browserManager.getPage();
            
            // Ensure we're on LinkedIn feed first
            const currentUrl = page.url();
            if (!currentUrl.includes('linkedin.com/feed')) {
                logger.info('Navigating to LinkedIn feed first');
                await page.goto(this.homeUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                await this.browserManager.humanLikeDelay(2000, 3000);
            }
            
            const jobsUrl = 'https://www.linkedin.com/jobs/';
            
            logger.info('Navigating to LinkedIn Jobs page');
            await page.goto(jobsUrl, { waitUntil: 'networkidle2', timeout: 30000 });
            await this.browserManager.humanLikeDelay(3000, 5000);
            
            // Wait for jobs page to load properly
            try {
                await page.waitForSelector('.jobs-search-box, .jobs-search-results-list, .jobs-home__quick-search', { timeout: 10000 });
                logger.info('Jobs page loaded successfully');
            } catch (error) {
                logger.warn('Jobs page elements not found, but continuing...');
            }
            
            return true;
        } catch (error) {
            logger.error('Failed to navigate to jobs page:', error);
            throw error;
        }
    }

    async navigateToMyJobs() {
        try {
            if (!this.isLoggedIn) {
                throw new Error('Not logged in to LinkedIn');
            }

            const page = this.browserManager.getPage();
            const myJobsUrl = 'https://www.linkedin.com/my-items/saved-jobs/';
            
            logger.info('Navigating to My Jobs page');
            await page.goto(myJobsUrl, { waitUntil: 'networkidle2' });
            await this.browserManager.waitForLinkedInLoad();
            
            return true;
        } catch (error) {
            logger.error('Failed to navigate to my jobs page:', error);
            throw error;
        }
    }

    async logout() {
        try {
            if (!this.isLoggedIn) {
                logger.info('Already logged out');
                return true;
            }

            const page = this.browserManager.getPage();
            
            // Click on profile menu
            await this.browserManager.humanLikeClick('.global-nav__me');
            await this.browserManager.humanLikeDelay(1000, 2000);
            
            // Click logout
            const logoutButton = await page.$('a[href*="logout"]');
            if (logoutButton) {
                await this.browserManager.humanLikeClick('a[href*="logout"]');
                await page.waitForNavigation({ waitUntil: 'networkidle2' });
                logger.info('Successfully logged out of LinkedIn');
                this.isLoggedIn = false;
                return true;
            } else {
                logger.warn('Logout button not found');
                return false;
            }
            
        } catch (error) {
            logger.error('Error during logout:', error);
            return false;
        }
    }

    async ensureLoggedIn() {
        try {
            // Check if browser manager page is ready
            if (!await this.browserManager.ensurePageReady()) {
                logger.error('Failed to ensure page is ready');
                return false;
            }

            // Check current login status
            if (this.isLoggedIn && await this.checkIfLoggedIn()) {
                logger.info('Already logged in and verified');
                return true;
            }

            // Attempt login with retry
            let attempts = 0;
            const maxAttempts = 3;
            
            while (attempts < maxAttempts) {
                try {
                    logger.info(`Login attempt ${attempts + 1}/${maxAttempts}`);
                    await this.login();
                    
                    if (this.isLoggedIn) {
                        return true;
                    }
                    
                    attempts++;
                    if (attempts < maxAttempts) {
                        await this.browserManager.humanLikeDelay(5000, 10000);
                    }
                    
                } catch (error) {
                    logger.error(`Login attempt ${attempts + 1} failed:`, error);
                    attempts++;
                    
                    if (attempts < maxAttempts) {
                        logger.info('Waiting before retry...');
                        await this.browserManager.humanLikeDelay(10000, 15000);
                        
                        // Try to recover by relaunching browser
                        try {
                            await this.browserManager.close();
                            await this.browserManager.launch();
                            await this.browserManager.setupPage();
                        } catch (launchError) {
                            logger.error('Failed to relaunch browser:', launchError);
                        }
                    }
                }
            }
            
            logger.error(`Failed to login after ${maxAttempts} attempts`);
            return false;
            
        } catch (error) {
            logger.error('Critical error in ensureLoggedIn:', error);
            return false;
        }
    }

    getBrowserManager() {
        return this.browserManager;
    }

    async close() {
        await this.browserManager.close();
        this.isLoggedIn = false;
    }
}

module.exports = LinkedInAuth;
