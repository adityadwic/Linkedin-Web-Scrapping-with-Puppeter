const LinkedInAuth = require('./linkedinAuth');
const logger = require('../utils/logger');

class CompanyScraper {
    constructor(database) {
        this.database = database;
        this.auth = new LinkedInAuth();
    }

    async scrapeCompanies(companyNames = null) {
        const startTime = Date.now();
        let scrapedCount = 0;
        let errorsCount = 0;

        try {
            logger.info('Starting company scraping process');
            
            // Ensure we're logged in
            await this.auth.ensureLoggedIn();

            // Get companies to scrape
            const companies = companyNames || await this.getCompaniesToScrape();
            logger.info(`Found ${companies.length} companies to scrape`);

            // Scrape each company
            for (const companyName of companies) {
                try {
                    const companyData = await this.scrapeCompanyData(companyName);
                    if (companyData) {
                        await this.saveCompanyData(companyData);
                        scrapedCount++;
                        logger.info(`Scraped company: ${companyName}`);
                    }
                    
                    // Add delay between scrapes
                    await this.auth.getBrowserManager().humanLikeDelay(3000, 6000);
                    
                } catch (error) {
                    logger.error(`Error scraping company ${companyName}:`, error);
                    errorsCount++;
                }
            }

            // Log scraping session
            await this.logScrapingSession('company_scrape', 'success', scrapedCount, errorsCount, startTime);
            
            logger.info(`Company scraping completed. Scraped ${scrapedCount} companies with ${errorsCount} errors`);
            return { scrapedCount, errorsCount };

        } catch (error) {
            logger.error('Company scraping failed:', error);
            await this.logScrapingSession('company_scrape', 'error', scrapedCount, errorsCount, startTime, error.message);
            throw error;
        }
    }

    async getCompaniesToScrape() {
        try {
            // Get unique companies from jobs table that haven't been scraped recently
            const companies = await this.database.all(`
                SELECT DISTINCT j.company 
                FROM jobs j
                LEFT JOIN companies c ON j.company = c.company_name
                WHERE c.company_name IS NULL 
                   OR c.scraped_at < datetime('now', '-30 days')
                ORDER BY j.scraped_at DESC
                LIMIT 20
            `);

            return companies.map(row => row.company);

        } catch (error) {
            logger.error('Error getting companies to scrape:', error);
            return [];
        }
    }

    async scrapeCompanyData(companyName) {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Search for the company
            const companyUrl = await this.searchCompany(companyName);
            if (!companyUrl) {
                logger.warn(`Could not find LinkedIn page for company: ${companyName}`);
                return null;
            }

            // Navigate to company page
            await page.goto(companyUrl, { waitUntil: 'networkidle2' });
            await browserManager.waitForLinkedInLoad();

            // Extract company data
            const companyData = await this.extractCompanyData(page, companyName);
            
            return companyData;

        } catch (error) {
            logger.error(`Error scraping company data for ${companyName}:`, error);
            return null;
        }
    }

    async searchCompany(companyName) {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Navigate to LinkedIn search
            await page.goto('https://www.linkedin.com/search/results/companies/', { waitUntil: 'networkidle2' });
            await browserManager.humanLikeDelay(2000, 3000);

            // Find and use search box
            const searchBox = await page.$('input[aria-label*="Search"], .search-global-typeahead__input');
            if (searchBox) {
                await browserManager.humanLikeType('input[aria-label*="Search"]', companyName);
                await page.keyboard.press('Enter');
                await page.waitForNavigation({ waitUntil: 'networkidle2' });
                await browserManager.humanLikeDelay(2000, 3000);

                // Click on companies filter if not already selected
                const companiesFilter = await page.$('button[aria-label*="Companies"]');
                if (companiesFilter) {
                    await browserManager.humanLikeClick('button[aria-label*="Companies"]');
                    await browserManager.humanLikeDelay(1000, 2000);
                }

                // Get first company result
                const firstResult = await page.$('.entity-result__title-text a, .search-result__result-link');
                if (firstResult) {
                    const companyUrl = await page.evaluate(element => element.href, firstResult);
                    return companyUrl;
                }
            }

            return null;

        } catch (error) {
            logger.error('Error searching for company:', error);
            return null;
        }
    }

    async extractCompanyData(page, companyName) {
        try {
            const companyData = await page.evaluate(() => {
                const data = {};

                // Company name
                data.name = document.querySelector('.org-top-card-summary__title, .top-card-layout__title')?.innerText?.trim() || '';

                // Industry
                data.industry = document.querySelector('.org-top-card-summary__industry, .top-card-layout__headline')?.innerText?.trim() || '';

                // Company size
                const sizeElement = document.querySelector('.org-about-company-module__company-size-definition, .top-card-layout__first-subline');
                data.size = sizeElement?.innerText?.trim() || '';

                // Location
                const locationElement = document.querySelector('.org-top-card-summary__headquarter, .top-card-layout__second-subline');
                data.location = locationElement?.innerText?.trim() || '';

                // Website
                const websiteElement = document.querySelector('a[href*="http"]:not([href*="linkedin.com"])');
                data.website = websiteElement?.href || '';

                // Description
                const descElement = document.querySelector('.org-about-company-module__description, .about-us-description');
                data.description = descElement?.innerText?.trim() || '';

                return data;
            });

            // Extract additional details
            const additionalData = await this.extractAdditionalCompanyDetails(page);
            
            return {
                ...companyData,
                ...additionalData,
                name: companyData.name || companyName,
                scrapedAt: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Error extracting company data:', error);
            return null;
        }
    }

    async extractAdditionalCompanyDetails(page) {
        try {
            const browserManager = this.auth.getBrowserManager();

            // Try to click on "About" section to get more details
            const aboutTab = await page.$('a[href*="about"], button[data-test-id="about-tab"]');
            if (aboutTab) {
                await browserManager.humanLikeClick('a[href*="about"]');
                await browserManager.humanLikeDelay(2000, 3000);
            }

            const details = await page.evaluate(() => {
                const data = {};

                // Founded year
                const foundedElement = document.querySelector('.org-about-company-module__founded, [data-test-id="founded-year"]');
                if (foundedElement) {
                    const foundedText = foundedElement.innerText;
                    const yearMatch = foundedText.match(/\d{4}/);
                    data.foundedYear = yearMatch ? parseInt(yearMatch[0]) : null;
                }

                // Employee count (more precise)
                const employeeElement = document.querySelector('.org-about-company-module__company-staff-count-range');
                if (employeeElement) {
                    const employeeText = employeeElement.innerText;
                    const countMatch = employeeText.match(/[\d,]+/);
                    if (countMatch) {
                        data.employeesCount = parseInt(countMatch[0].replace(/,/g, ''));
                    }
                }

                // Specialties
                const specialtiesElement = document.querySelector('.org-about-company-module__specialities');
                if (specialtiesElement) {
                    const specialtiesText = specialtiesElement.innerText;
                    data.specialties = specialtiesText.split(',').map(s => s.trim());
                }

                return data;
            });

            return details;

        } catch (error) {
            logger.error('Error extracting additional company details:', error);
            return {};
        }
    }

    async saveCompanyData(companyData) {
        try {
            await this.database.insertCompany(companyData);
            logger.info(`Saved company data: ${companyData.name}`);

        } catch (error) {
            logger.error('Error saving company data:', error);
            throw error;
        }
    }

    async scrapeRecruiters(companyName, maxRecruiters = 10) {
        try {
            logger.info(`Starting recruiter scraping for company: ${companyName}`);
            
            await this.auth.ensureLoggedIn();
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Search for recruiters at the company
            const searchQuery = `recruiter ${companyName}`;
            await page.goto(`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}`, { 
                waitUntil: 'networkidle2' 
            });
            await browserManager.waitForLinkedInLoad();

            const recruiters = await this.extractRecruiters(page, companyName, maxRecruiters);
            
            // Save recruiters to database
            for (const recruiter of recruiters) {
                await this.saveRecruiterData(recruiter);
            }

            logger.info(`Scraped ${recruiters.length} recruiters for ${companyName}`);
            return recruiters;

        } catch (error) {
            logger.error(`Error scraping recruiters for ${companyName}:`, error);
            throw error;
        }
    }

    async extractRecruiters(page, companyName, maxRecruiters) {
        const recruiters = [];
        const browserManager = this.auth.getBrowserManager();

        try {
            let currentCount = 0;
            let currentPage = 1;

            while (currentCount < maxRecruiters) {
                // Wait for search results
                await page.waitForSelector('.search-result, .entity-result', { timeout: 10000 });
                await browserManager.humanLikeDelay(2000, 3000);

                // Get recruiter cards
                const recruiterCards = await page.$$('.entity-result, .search-result__wrapper');
                
                for (let i = 0; i < recruiterCards.length && currentCount < maxRecruiters; i++) {
                    try {
                        const recruiterData = await this.extractRecruiterData(recruiterCards[i], page, companyName);
                        if (recruiterData) {
                            recruiters.push(recruiterData);
                            currentCount++;
                        }
                    } catch (error) {
                        logger.error(`Error extracting recruiter ${i}:`, error);
                    }
                }

                // Navigate to next page if needed
                if (currentCount < maxRecruiters) {
                    const hasNextPage = await this.goToNextRecruitersPage(page);
                    if (!hasNextPage) break;
                    currentPage++;
                }
            }

            return recruiters;

        } catch (error) {
            logger.error('Error extracting recruiters:', error);
            return recruiters;
        }
    }

    async extractRecruiterData(recruiterCard, page, companyName) {
        try {
            const recruiterData = await page.evaluate((element, company) => {
                const nameElement = element.querySelector('.entity-result__title-text a, .actor-name');
                const titleElement = element.querySelector('.entity-result__primary-subtitle, .subline-level-1');
                const locationElement = element.querySelector('.entity-result__secondary-subtitle, .subline-level-2');
                const profileLink = element.querySelector('.entity-result__title-text a, .actor-name')?.href;

                // Check if this person is actually associated with the company
                const elementText = element.innerText.toLowerCase();
                const companyText = company.toLowerCase();
                
                if (!elementText.includes(companyText)) {
                    return null; // Skip if not from target company
                }

                return {
                    name: nameElement?.innerText?.trim() || '',
                    title: titleElement?.innerText?.trim() || '',
                    location: locationElement?.innerText?.trim() || '',
                    profileUrl: profileLink || '',
                    company: company
                };
            }, recruiterCard, companyName);

            if (recruiterData && recruiterData.name) {
                recruiterData.scrapedAt = new Date().toISOString();
                return recruiterData;
            }

            return null;

        } catch (error) {
            logger.error('Error extracting recruiter data:', error);
            return null;
        }
    }

    async saveRecruiterData(recruiterData) {
        try {
            await this.database.run(
                `INSERT OR REPLACE INTO recruiters 
                (name, title, company, profile_url, location, scraped_at)
                VALUES (?, ?, ?, ?, ?, ?)`,
                [
                    recruiterData.name,
                    recruiterData.title,
                    recruiterData.company,
                    recruiterData.profileUrl,
                    recruiterData.location,
                    recruiterData.scrapedAt
                ]
            );

            logger.info(`Saved recruiter: ${recruiterData.name} at ${recruiterData.company}`);

        } catch (error) {
            logger.error('Error saving recruiter data:', error);
            throw error;
        }
    }

    async goToNextRecruitersPage(page) {
        try {
            const browserManager = this.auth.getBrowserManager();
            const nextButton = await page.$('button[aria-label*="Next"], .artdeco-pagination__button--next');
            
            if (nextButton) {
                const isDisabled = await page.evaluate(btn => btn.disabled || btn.classList.contains('artdeco-pagination__button--disabled'), nextButton);
                if (!isDisabled) {
                    await browserManager.humanLikeClick('button[aria-label*="Next"]');
                    await page.waitForNavigation({ waitUntil: 'networkidle2' });
                    await browserManager.waitForLinkedInLoad();
                    return true;
                }
            }
            
            return false;

        } catch (error) {
            logger.error('Error navigating to next recruiters page:', error);
            return false;
        }
    }

    async getCompanyStats() {
        try {
            const stats = {};

            // Total companies scraped
            stats.totalCompanies = (await this.database.get('SELECT COUNT(*) as count FROM companies')).count;

            // Companies by industry
            stats.industrieDistribution = await this.database.all(`
                SELECT industry, COUNT(*) as count 
                FROM companies 
                WHERE industry IS NOT NULL AND industry != ''
                GROUP BY industry 
                ORDER BY count DESC 
                LIMIT 10
            `);

            // Company size distribution
            stats.sizeDistribution = await this.database.all(`
                SELECT size, COUNT(*) as count 
                FROM companies 
                WHERE size IS NOT NULL AND size != ''
                GROUP BY size 
                ORDER BY count DESC
            `);

            // Recent scrapes
            stats.recentScrapes = await this.database.all(`
                SELECT company_name, industry, size, scraped_at
                FROM companies 
                ORDER BY scraped_at DESC 
                LIMIT 5
            `);

            return stats;

        } catch (error) {
            logger.error('Error getting company stats:', error);
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

module.exports = CompanyScraper;
