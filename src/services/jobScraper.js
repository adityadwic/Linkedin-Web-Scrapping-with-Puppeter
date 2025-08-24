const LinkedInAuth = require('./linkedinAuth');
const logger = require('../utils/logger');

class JobScraper {
    constructor(database) {
        this.database = database;
        this.auth = new LinkedInAuth();
        this.searchFilters = {
            keywords: process.env.JOB_SEARCH_KEYWORDS?.split(',') || [],
            locations: process.env.JOB_LOCATIONS?.split(',') || [],
            jobTypes: process.env.JOB_TYPES?.split(',') || [],
            maxJobs: parseInt(process.env.MAX_JOBS_PER_SCRAPE) || 50
        };
    }

    async scrapeJobsWithFreshStart(customFilters = null, freshStart = true) {
        const startTime = Date.now();
        let scrapedJobs = [];
        let errorsCount = 0;

        try {
            logger.info(`Starting job scraping process with freshStart: ${freshStart}`);
            
            if (freshStart) {
                // Close existing browser and start fresh
                await this.auth.close();
                
                // Create new auth instance with fresh browser
                this.auth = new LinkedInAuth();
                logger.info('Created fresh LinkedIn authentication instance');
            }
            
            // Ensure we're logged in
            await this.auth.ensureLoggedIn();
            await this.auth.navigateToJobs();

            const filters = customFilters || this.searchFilters;
            
            // Apply search filters
            await this.applySearchFilters(filters);

            // Scrape job listings
            scrapedJobs = await this.scrapeJobListings(filters.maxJobs);
            
            // Process and save jobs
            for (const job of scrapedJobs) {
                try {
                    await this.processAndSaveJob(job);
                } catch (error) {
                    logger.error('Error processing job:', error);
                    errorsCount++;
                }
            }

            // Log scraping session
            await this.logScrapingSession('job_scrape', 'success', scrapedJobs.length, errorsCount, startTime);
            
            logger.info(`Job scraping completed. Scraped ${scrapedJobs.length} jobs with ${errorsCount} errors`);
            return scrapedJobs;

        } catch (error) {
            logger.error('Job scraping failed:', error);
            await this.logScrapingSession('job_scrape', 'failed', 0, 1, startTime);
            throw error;
        }
    }

    async scrapeJobs(customFilters = null) {
        const startTime = Date.now();
        let scrapedJobs = [];
        let errorsCount = 0;

        try {
            logger.info('Starting job scraping process');
            
            // Ensure we're logged in
            await this.auth.ensureLoggedIn();
            await this.auth.navigateToJobs();

            const filters = customFilters || this.searchFilters;
            
            // Apply search filters
            await this.applySearchFilters(filters);

            // Scrape job listings
            scrapedJobs = await this.scrapeJobListings(filters.maxJobs);
            
            // Process and save jobs
            for (const job of scrapedJobs) {
                try {
                    await this.processAndSaveJob(job);
                } catch (error) {
                    logger.error('Error processing job:', error);
                    errorsCount++;
                }
            }

            // Log scraping session
            await this.logScrapingSession('job_scrape', 'success', scrapedJobs.length, errorsCount, startTime);
            
            logger.info(`Job scraping completed. Scraped ${scrapedJobs.length} jobs with ${errorsCount} errors`);
            return scrapedJobs;

        } catch (error) {
            logger.error('Job scraping failed:', error);
            await this.logScrapingSession('job_scrape', 'error', scrapedJobs.length, errorsCount, startTime, error.message);
            throw error;
        }
    }

    async applySearchFilters(filters) {
        try {
            const page = this.auth.getBrowserManager().getPage();
            
            // Apply keyword search
            if (filters.keywords && filters.keywords.length > 0) {
                const searchQuery = filters.keywords.join(' OR ');
                await this.searchByKeywords(searchQuery);
            }

            // Apply location filter
            if (filters.locations && filters.locations.length > 0) {
                await this.filterByLocation(filters.locations);
            }

            // Apply job type filter
            if (filters.jobTypes && filters.jobTypes.length > 0) {
                await this.filterByJobType(filters.jobTypes);
            }

            // Apply date filter (recent jobs only)
            await this.filterByDate('24h');

            logger.info('Search filters applied successfully');
            
        } catch (error) {
            logger.error('Error applying search filters:', error);
            throw error;
        }
    }

    async searchByKeywords(keywords) {
        try {
            const browserManager = this.auth.getBrowserManager();
            const page = browserManager.getPage();

            // Find and use the search box
            const searchSelectors = [
                '.jobs-search-box__text-input',
                '[data-test-id="jobs-search-keywords-input"]',
                'input[aria-label*="Search by title"]',
                '.jobs-search-box input'
            ];

            let searchInput = null;
            for (const selector of searchSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 5000 });
                    searchInput = await page.$(selector);
                    if (searchInput) break;
                } catch {
                    continue;
                }
            }

            if (!searchInput) {
                throw new Error('Could not find job search input');
            }

            // Clear and type keywords
            await browserManager.humanLikeType(searchSelectors[0], keywords);
            await browserManager.humanLikeDelay(1000, 2000);

            // Press Enter or click search button
            await page.keyboard.press('Enter');
            await page.waitForNavigation({ waitUntil: 'networkidle2' });
            await browserManager.waitForLinkedInLoad();

            logger.info(`Applied keyword filter: ${keywords}`);

        } catch (error) {
            logger.error('Error applying keyword search:', error);
            throw error;
        }
    }

    async filterByLocation(locations) {
        try {
            const browserManager = this.auth.getBrowserManager();
            const page = browserManager.getPage();

            // Click location filter
            const locationButton = await page.$('.jobs-search-box__location-selector, [data-test-id="jobs-search-location-input"]');
            if (locationButton) {
                await browserManager.humanLikeClick('.jobs-search-box__location-selector');
                await browserManager.humanLikeDelay(1000, 2000);

                // Clear existing location and add new one
                const locationInput = await page.$('input[aria-label*="location"]');
                if (locationInput) {
                    await locationInput.click({ clickCount: 3 });
                    await page.keyboard.press('Backspace');
                    await browserManager.humanLikeType('input[aria-label*="location"]', locations[0]);
                    await page.keyboard.press('Enter');
                    await browserManager.humanLikeDelay(1000, 2000);
                }
            }

            logger.info(`Applied location filter: ${locations[0]}`);

        } catch (error) {
            logger.error('Error applying location filter:', error);
        }
    }

    async filterByJobType(jobTypes) {
        try {
            const browserManager = this.auth.getBrowserManager();
            const page = browserManager.getPage();

            // Click filters button
            const filtersButton = await page.$('button[aria-label*="filter"], .jobs-search-filters-bar__filter-button');
            if (filtersButton) {
                await browserManager.humanLikeClick('button[aria-label*="filter"]');
                await browserManager.humanLikeDelay(1000, 2000);

                // Apply job type filters
                for (const jobType of jobTypes) {
                    const jobTypeCheckbox = await page.$(`label:contains("${jobType}") input[type="checkbox"]`);
                    if (jobTypeCheckbox) {
                        await browserManager.humanLikeClick(`label:contains("${jobType}") input[type="checkbox"]`);
                        await browserManager.humanLikeDelay(500, 1000);
                    }
                }

                // Apply filters
                const applyButton = await page.$('button[data-test-id="filter-apply-button"]');
                if (applyButton) {
                    await browserManager.humanLikeClick('button[data-test-id="filter-apply-button"]');
                    await page.waitForNavigation({ waitUntil: 'networkidle2' });
                    await browserManager.waitForLinkedInLoad();
                }
            }

            logger.info(`Applied job type filters: ${jobTypes.join(', ')}`);

        } catch (error) {
            logger.error('Error applying job type filter:', error);
        }
    }

    async filterByDate(timeframe = '24h') {
        try {
            const browserManager = this.auth.getBrowserManager();
            const page = browserManager.getPage();

            // Look for date filter options
            const dateFilter = await page.$('[data-test-id="date-posted-filter"]');
            if (dateFilter) {
                await browserManager.humanLikeClick('[data-test-id="date-posted-filter"]');
                await browserManager.humanLikeDelay(1000, 2000);

                // Select timeframe
                const timeframeOption = await page.$(`[data-test-id="filter-option-${timeframe}"]`);
                if (timeframeOption) {
                    await browserManager.humanLikeClick(`[data-test-id="filter-option-${timeframe}"]`);
                    await browserManager.humanLikeDelay(1000, 2000);
                }
            }

            logger.info(`Applied date filter: ${timeframe}`);

        } catch (error) {
            logger.error('Error applying date filter:', error);
        }
    }

    async scrapeJobListings(page, maxJobs = 100) {
        try {
            const browserManager = this.auth.getBrowserManager();
            const jobs = [];
            let processedJobIds = new Set();
            let consecutiveNoNewJobs = 0;
            const maxConsecutiveNoNewJobs = 3;

            logger.info(`Starting to scrape job listings, target: ${maxJobs} jobs`);

            // Enhanced scrolling with better detection
            while (jobs.length < maxJobs && consecutiveNoNewJobs < maxConsecutiveNoNewJobs) {
                // Wait for job cards to load
                await page.waitForSelector('.job-card-container, .jobs-search-results-list .job-card', { 
                    timeout: 10000 
                }).catch(() => {
                    logger.warn('Job cards selector timeout, continuing...');
                });

                // Get current job cards with multiple selectors
                const jobCardSelectors = [
                    '.job-card-container',
                    '.jobs-search-results-list .job-card',
                    '.jobs-search-result-item',
                    '[data-job-id]',
                    '.jobs-search-results__list-item'
                ];

                let jobCards = [];
                for (const selector of jobCardSelectors) {
                    const cards = await page.$$(selector);
                    if (cards.length > 0) {
                        jobCards = cards;
                        logger.debug(`Found ${cards.length} job cards with selector: ${selector}`);
                        break;
                    }
                }

                if (jobCards.length === 0) {
                    logger.warn('No job cards found, attempting page refresh...');
                    await page.reload({ waitUntil: 'networkidle2' });
                    await browserManager.waitForLinkedInLoad();
                    consecutiveNoNewJobs++;
                    continue;
                }

                logger.info(`Found ${jobCards.length} job cards on current view`);

                // Process each job card
                const newJobsInThisBatch = [];
                for (let i = 0; i < Math.min(jobCards.length, maxJobs - jobs.length); i++) {
                    try {
                        const jobCard = jobCards[i];
                        
                        // Extract job ID early to avoid duplicates
                        const jobId = await jobCard.evaluate(el => {
                            return el.getAttribute('data-job-id') || 
                                   el.querySelector('[data-job-id]')?.getAttribute('data-job-id') ||
                                   el.querySelector('a')?.href?.match(/jobs\/view\/(\d+)/)?.[1] ||
                                   `fallback_${Date.now()}_${Math.random()}`;
                        });

                        if (processedJobIds.has(jobId)) {
                            logger.debug(`Skipping duplicate job: ${jobId}`);
                            continue;
                        }

                        // Scroll job card into view
                        await jobCard.evaluate(el => {
                            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        });
                        await browserManager.humanLikeDelay(1000, 1500);

                        const jobData = await this.scrapeJobCard(jobCard, page);
                        
                        if (jobData && jobData.title && jobData.company) {
                            jobs.push(jobData);
                            processedJobIds.add(jobId);
                            newJobsInThisBatch.push(jobData);
                            
                            logger.debug(`Scraped job ${jobs.length}/${maxJobs}: ${jobData.title} at ${jobData.company}`);
                        } else {
                            logger.warn(`Invalid job data for card ${i}, skipping`);
                        }

                        // Random delay between jobs to appear more human
                        await browserManager.humanLikeDelay(500, 1500);

                    } catch (error) {
                        logger.error(`Error scraping job card ${i}:`, error);
                        continue;
                    }
                }

                // Check if we got new jobs in this batch
                if (newJobsInThisBatch.length === 0) {
                    consecutiveNoNewJobs++;
                    logger.warn(`No new jobs found in batch, consecutive count: ${consecutiveNoNewJobs}`);
                } else {
                    consecutiveNoNewJobs = 0;
                    logger.info(`Added ${newJobsInThisBatch.length} new jobs, total: ${jobs.length}`);
                }

                // Enhanced scrolling and pagination
                if (jobs.length < maxJobs) {
                    // Try to scroll to load more jobs
                    const beforeScrollCount = await page.$$('.job-card-container, .job-card').then(cards => cards.length);
                    
                    // Multiple scroll attempts
                    for (let scrollAttempt = 0; scrollAttempt < 3; scrollAttempt++) {
                        await page.evaluate(() => {
                            window.scrollTo(0, document.body.scrollHeight);
                        });
                        await browserManager.humanLikeDelay(2000, 3000);
                        
                        // Check if new content loaded
                        const afterScrollCount = await page.$$('.job-card-container, .job-card').then(cards => cards.length);
                        if (afterScrollCount > beforeScrollCount) {
                            logger.debug(`Scroll ${scrollAttempt + 1} loaded ${afterScrollCount - beforeScrollCount} more jobs`);
                            break;
                        }
                    }

                    // Try pagination buttons
                    const nextButton = await page.$('button[aria-label*="Next"], .pv2 button[type="button"]:last-child');
                    if (nextButton) {
                        const isEnabled = await nextButton.evaluate(btn => !btn.disabled && !btn.getAttribute('aria-disabled'));
                        if (isEnabled) {
                            logger.info('Clicking next page button...');
                            await browserManager.humanLikeClick('button[aria-label*="Next"]');
                            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {
                                logger.warn('Navigation timeout after next button click');
                            });
                            await browserManager.waitForLinkedInLoad();
                        } else {
                            logger.info('Next button disabled, reached end of results');
                            break;
                        }
                    }

                    // Check for "See more jobs" button
                    const seeMoreButton = await page.$('button:contains("See more"), .jobs-search-results__pagination button');
                    if (seeMoreButton) {
                        logger.info('Clicking see more jobs button...');
                        await browserManager.humanLikeClick('button:contains("See more")');
                        await browserManager.humanLikeDelay(3000, 5000);
                    }
                }

                // Safety check to prevent infinite loops
                if (consecutiveNoNewJobs >= maxConsecutiveNoNewJobs) {
                    logger.warn('Reached maximum consecutive empty batches, stopping scrape');
                    break;
                }
            }

            logger.info(`Scraping completed. Total jobs scraped: ${jobs.length}`);
            return jobs;

        } catch (error) {
            logger.error('Error scraping job listings:', error);
            throw error;
        }
    }

    async scrapeJobCard(jobCard, page) {
        try {
            const browserManager = this.auth.getBrowserManager();

            // Click on job card to get details
            await jobCard.click();
            await browserManager.humanLikeDelay(2000, 3000);

            // Extract basic job information
            const jobData = await page.evaluate(() => {
                const titleElement = document.querySelector('.job-details-jobs-unified-top-card__job-title, .jobs-unified-top-card__job-title');
                const companyElement = document.querySelector('.job-details-jobs-unified-top-card__company-name, .jobs-unified-top-card__company-name');
                const locationElement = document.querySelector('.job-details-jobs-unified-top-card__bullet, .jobs-unified-top-card__bullet');
                const descriptionElement = document.querySelector('.jobs-description, .jobs-box__html-content');

                return {
                    title: titleElement?.innerText?.trim() || '',
                    company: companyElement?.innerText?.trim() || '',
                    location: locationElement?.innerText?.trim() || '',
                    description: descriptionElement?.innerText?.trim() || '',
                    url: window.location.href
                };
            });

            // Extract additional details
            const additionalDetails = await this.extractJobDetails(page);
            
            // Generate job ID from URL or title+company
            const jobId = this.generateJobId(jobData.url, jobData.title, jobData.company);
            
            // Calculate match score
            const matchScore = this.calculateMatchScore(jobData);

            return {
                jobId,
                ...jobData,
                ...additionalDetails,
                matchScore,
                keywordsMatched: this.getMatchedKeywords(jobData),
                scrapedAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Error scraping job card details:', error);
            return null;
        }
    }

    async extractJobDetails(page) {
        try {
            return await page.evaluate(() => {
                const details = {};

                // Job type
                const jobTypeElement = document.querySelector('[data-test-id="job-type"]');
                details.jobType = jobTypeElement?.innerText?.trim() || '';

                // Experience level
                const experienceElement = document.querySelector('[data-test-id="experience-level"]');
                details.experienceLevel = experienceElement?.innerText?.trim() || '';

                // Posted date
                const postedElement = document.querySelector('.jobs-unified-top-card__posted-date');
                details.postedDate = postedElement?.innerText?.trim() || '';

                // Salary range
                const salaryElement = document.querySelector('.jobs-unified-top-card__salary');
                details.salaryRange = salaryElement?.innerText?.trim() || '';

                // Requirements (from job description)
                const requirementsText = document.querySelector('.jobs-description')?.innerText || '';
                details.requirements = requirementsText.slice(0, 1000); // Limit length

                return details;
            });
        } catch (error) {
            logger.error('Error extracting job details:', error);
            return {};
        }
    }

    generateJobId(url, title, company) {
        // Extract LinkedIn job ID from URL if possible
        const urlMatch = url.match(/jobs\/view\/(\d+)/);
        if (urlMatch) {
            return urlMatch[1];
        }
        
        // Generate ID from title and company
        const cleanTitle = title.toLowerCase().replace(/[^a-z0-9]/g, '');
        const cleanCompany = company.toLowerCase().replace(/[^a-z0-9]/g, '');
        return `${cleanCompany}_${cleanTitle}_${Date.now()}`;
    }

    calculateMatchScore(jobData) {
        let score = 0;
        const keywords = this.searchFilters.keywords.map(k => k.toLowerCase());
        
        const textToCheck = `${jobData.title} ${jobData.description}`.toLowerCase();
        
        keywords.forEach(keyword => {
            if (textToCheck.includes(keyword)) {
                score += 1;
            }
        });

        return keywords.length > 0 ? (score / keywords.length) * 100 : 0;
    }

    getMatchedKeywords(jobData) {
        const keywords = this.searchFilters.keywords.map(k => k.toLowerCase());
        const textToCheck = `${jobData.title} ${jobData.description}`.toLowerCase();
        
        return keywords.filter(keyword => textToCheck.includes(keyword));
    }

    async goToNextPage() {
        try {
            const browserManager = this.auth.getBrowserManager();
            const page = browserManager.getPage();

            const nextButton = await page.$('button[aria-label*="next"], .jobs-search-pagination__button--next');
            if (nextButton) {
                const isDisabled = await page.evaluate(btn => btn.disabled, nextButton);
                if (!isDisabled) {
                    await browserManager.humanLikeClick('button[aria-label*="next"]');
                    await page.waitForNavigation({ waitUntil: 'networkidle2' });
                    await browserManager.waitForLinkedInLoad();
                    return true;
                }
            }
            return false;
        } catch (error) {
            logger.error('Error navigating to next page:', error);
            return false;
        }
    }

    async processAndSaveJob(jobData) {
        try {
            // Check if job already exists
            const existingJob = await this.database.get(
                'SELECT id FROM jobs WHERE job_id = ?',
                [jobData.jobId]
            );

            if (existingJob) {
                logger.info(`Job already exists: ${jobData.jobId}`);
                return;
            }

            // Save job to database
            await this.database.insertJob(jobData);
            logger.info(`Saved new job: ${jobData.title} at ${jobData.company}`);

        } catch (error) {
            logger.error('Error processing and saving job:', error);
            throw error;
        }
    }

    async logScrapingSession(type, status, itemsProcessed, errorsCount, startTime, errorMessage = null) {
        try {
            const duration = Date.now() - startTime;
            await this.database.run(
                `INSERT INTO scraping_logs 
                (type, status, items_processed, errors_count, duration_ms, completed_at, error_message)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
                [type, status, itemsProcessed, errorsCount, duration, errorMessage]
            );
        } catch (error) {
            logger.error('Error logging scraping session:', error);
        }
    }

    async close() {
        await this.auth.close();
    }
}

module.exports = JobScraper;
