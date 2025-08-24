const LinkedInAuth = require('./linkedinAuth');
const logger = require('../utils/logger');
const fs = require('fs');
const path = require('path');

class AutoApplicant {
    constructor(database) {
        this.database = database;
        this.auth = new LinkedInAuth();
        this.maxApplicationsPerDay = parseInt(process.env.MAX_APPLICATIONS_PER_DAY) || 20;
        this.applicationDelay = parseInt(process.env.APPLICATION_DELAY_MS) || 5000;
        this.autoApplyEnabled = process.env.AUTO_APPLY_ENABLED === 'true';
        this.cvPath = './data/cv.pdf';
        this.coverLetterTemplate = './data/cover_letter_template.txt';
    }

    async autoApplyToJobs(filters = null) {
        if (!this.autoApplyEnabled) {
            logger.info('Auto-apply is disabled');
            return { appliedCount: 0, skippedCount: 0, errorsCount: 0 };
        }

        const startTime = Date.now();
        let appliedCount = 0;
        let skippedCount = 0;
        let errorsCount = 0;

        try {
            logger.info('Starting auto-application process');
            
            // Check daily application limit
            const todayApplications = await this.getTodayApplicationsCount();
            if (todayApplications >= this.maxApplicationsPerDay) {
                logger.info(`Daily application limit reached: ${todayApplications}/${this.maxApplicationsPerDay}`);
                return { appliedCount: 0, skippedCount: 0, errorsCount: 0 };
            }

            const remainingApplications = this.maxApplicationsPerDay - todayApplications;
            logger.info(`Can apply to ${remainingApplications} more jobs today`);

            // Ensure we're logged in
            await this.auth.ensureLoggedIn();

            // Get jobs to apply to
            const jobs = await this.getJobsToApply(filters, remainingApplications);
            logger.info(`Found ${jobs.length} jobs to apply to`);

            // Apply to each job
            for (const job of jobs) {
                try {
                    const applicationResult = await this.applyToJob(job);
                    
                    if (applicationResult.success) {
                        await this.recordApplication(job, applicationResult);
                        appliedCount++;
                        logger.info(`Successfully applied to: ${job.title} at ${job.company}`);
                    } else {
                        skippedCount++;
                        logger.info(`Skipped job: ${job.title} - ${applicationResult.reason}`);
                    }
                    
                    // Respect rate limits
                    await this.auth.getBrowserManager().humanLikeDelay(this.applicationDelay, this.applicationDelay + 2000);
                    
                } catch (error) {
                    logger.error(`Error applying to job ${job.job_id}:`, error);
                    errorsCount++;
                }

                // Check if we've reached the daily limit
                if (appliedCount >= remainingApplications) {
                    logger.info('Daily application limit reached');
                    break;
                }
            }

            // Log application session
            await this.logApplicationSession('auto_apply', 'success', appliedCount, errorsCount, startTime);
            
            logger.info(`Auto-application completed. Applied: ${appliedCount}, Skipped: ${skippedCount}, Errors: ${errorsCount}`);
            return { appliedCount, skippedCount, errorsCount };

        } catch (error) {
            logger.error('Auto-application process failed:', error);
            await this.logApplicationSession('auto_apply', 'error', appliedCount, errorsCount, startTime, error.message);
            throw error;
        }
    }

    async getTodayApplicationsCount() {
        try {
            const result = await this.database.get(`
                SELECT COUNT(*) as count 
                FROM applications 
                WHERE date(applied_at) = date('now')
            `);
            return result.count;
        } catch (error) {
            logger.error('Error getting today applications count:', error);
            return 0;
        }
    }

    async getJobsToApply(filters, limit) {
        try {
            let query = `
                SELECT * FROM jobs 
                WHERE is_applied = FALSE 
                AND scraped_at >= datetime('now', '-3 days')
            `;
            
            const params = [];

            // Apply filters
            if (filters) {
                if (filters.minMatchScore) {
                    query += ' AND match_score >= ?';
                    params.push(filters.minMatchScore);
                }
                
                if (filters.keywords) {
                    const keywordConditions = filters.keywords.map(() => 'LOWER(title || " " || description) LIKE LOWER(?)').join(' OR ');
                    query += ` AND (${keywordConditions})`;
                    params.push(...filters.keywords.map(k => `%${k}%`));
                }
                
                if (filters.excludeCompanies) {
                    const excludeConditions = filters.excludeCompanies.map(() => 'company != ?').join(' AND ');
                    query += ` AND (${excludeConditions})`;
                    params.push(...filters.excludeCompanies);
                }
            }

            query += ` ORDER BY match_score DESC, scraped_at DESC LIMIT ?`;
            params.push(limit);

            const jobs = await this.database.all(query, params);
            return jobs;

        } catch (error) {
            logger.error('Error getting jobs to apply:', error);
            return [];
        }
    }

    async applyToJob(job) {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Navigate to job page
            let jobUrl = job.url;
            if (!jobUrl.includes('linkedin.com')) {
                jobUrl = `https://www.linkedin.com/jobs/view/${job.job_id}`;
            }

            await page.goto(jobUrl, { waitUntil: 'networkidle2' });
            await browserManager.waitForLinkedInLoad();

            // Check if job is still available and has Easy Apply
            const applicationCheck = await this.checkApplicationAvailability();
            if (!applicationCheck.canApply) {
                return { success: false, reason: applicationCheck.reason };
            }

            // Start application process
            if (applicationCheck.isEasyApply) {
                return await this.handleEasyApply(job);
            } else {
                return await this.handleRegularApply(job);
            }

        } catch (error) {
            logger.error('Error applying to job:', error);
            return { success: false, reason: 'Application error', error: error.message };
        }
    }

    async checkApplicationAvailability() {
        try {
            const page = this.auth.getBrowserManager().getPage();

            // Check if job is still available
            const jobExpired = await page.$('.job-view-layout__expired-message');
            if (jobExpired) {
                return { canApply: false, reason: 'Job expired' };
            }

            // Check if already applied
            const alreadyApplied = await page.$('.jobs-apply-button--applied');
            if (alreadyApplied) {
                return { canApply: false, reason: 'Already applied' };
            }

            // Check for Easy Apply button
            const easyApplyButton = await page.$('.jobs-apply-button[data-easy-apply-id]');
            if (easyApplyButton) {
                return { canApply: true, isEasyApply: true };
            }

            // Check for regular apply button
            const applyButton = await page.$('.jobs-apply-button');
            if (applyButton) {
                return { canApply: true, isEasyApply: false };
            }

            return { canApply: false, reason: 'No apply button found' };

        } catch (error) {
            logger.error('Error checking application availability:', error);
            return { canApply: false, reason: 'Error checking availability' };
        }
    }

    async handleEasyApply(job) {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Enhanced wait for Easy Apply button with multiple selectors
            const applySelectors = [
                '.jobs-apply-button[data-easy-apply-id]',
                'button[data-control-name="jobdetails_topcard_inapply"]',
                '.jobs-s-apply button[data-control-name="apply"]'
            ];

            let applyButton = null;
            for (const selector of applySelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 10000, visible: true });
                    applyButton = await page.$(selector);
                    if (applyButton) break;
                } catch (error) {
                    logger.debug(`Apply button not found with selector: ${selector}`);
                }
            }

            if (!applyButton) {
                return { success: false, reason: 'Easy Apply button not found after extended wait' };
            }

            // Click Easy Apply button with retry mechanism
            let clickSuccess = false;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    await browserManager.humanLikeClick(applySelectors[0]);
                    
                    // Wait for application modal to load
                    await page.waitForSelector('.jobs-easy-apply-modal, .application-modal', { 
                        timeout: 15000, 
                        visible: true 
                    });
                    
                    clickSuccess = true;
                    break;
                } catch (error) {
                    logger.warn(`Apply button click attempt ${attempt} failed:`, error.message);
                    if (attempt < 3) {
                        await browserManager.humanLikeDelay(3000, 5000);
                    }
                }
            }

            if (!clickSuccess) {
                return { success: false, reason: 'Failed to open application modal after 3 attempts' };
            }

            await browserManager.humanLikeDelay(2000, 3000);

            // Handle multi-step application process
            let currentStep = 1;
            const maxSteps = 5;

            while (currentStep <= maxSteps) {
                const stepResult = await this.handleApplicationStep(currentStep, job);
                
                if (stepResult.completed) {
                    break;
                } else if (stepResult.failed) {
                    return { success: false, reason: stepResult.reason };
                }

                currentStep++;
                await browserManager.humanLikeDelay(1000, 2000);
            }

            // Enhanced final submission with better waiting
            const submitSelectors = [
                'button[aria-label*="Submit"]',
                'button[data-test-id="submit-application"]',
                'button[data-control-name="continue_unify"]',
                '.jobs-apply-footer button[type="submit"]'
            ];

            let submitButton = null;
            for (const selector of submitSelectors) {
                try {
                    await page.waitForSelector(selector, { timeout: 8000, visible: true });
                    submitButton = await page.$(selector);
                    if (submitButton) break;
                } catch (error) {
                    logger.debug(`Submit button not found with selector: ${selector}`);
                }
            }

            if (submitButton) {
                await browserManager.humanLikeClick(submitSelectors[0]);
                
                // Enhanced verification with multiple success indicators
                try {
                    await page.waitForSelector('.artdeco-inline-feedback--success, .application-success, .jobs-apply-success', { 
                        timeout: 15000 
                    });
                    
                    const successMessage = await page.$('.artdeco-inline-feedback--success, .application-success, .jobs-apply-success');
                    if (successMessage) {
                        return { success: true, applicationId: `easy_apply_${Date.now()}`, method: 'easy_apply' };
                    }
                } catch (waitError) {
                    logger.warn('Success message not found, checking for modal close');
                    
                    // Alternative: check if modal closed (might indicate success)
                    const modalStillOpen = await page.$('.jobs-easy-apply-modal');
                    if (!modalStillOpen) {
                        return { success: true, applicationId: `easy_apply_${Date.now()}`, method: 'easy_apply_assumed' };
                    }
                }
            }

            return { success: false, reason: 'Submit button not found or submission failed' };

        } catch (error) {
            logger.error('Error handling Easy Apply:', error);
            return { success: false, reason: 'Easy Apply error', error: error.message };
        }
    }

    async handleApplicationStep(stepNumber, job) {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Check for different types of application steps
            const stepContent = await page.evaluate(() => {
                const stepContainer = document.querySelector('.application-step, .jobs-easy-apply-content');
                return stepContainer ? stepContainer.innerText.toLowerCase() : '';
            });

            // Handle contact information step
            if (stepContent.includes('contact') || stepContent.includes('phone')) {
                await this.fillContactInformation();
            }

            // Handle resume upload step
            if (stepContent.includes('resume') || stepContent.includes('cv')) {
                await this.handleResumeUpload();
            }

            // Handle cover letter step
            if (stepContent.includes('cover letter')) {
                await this.handleCoverLetter(job);
            }

            // Handle additional questions
            if (stepContent.includes('question') || stepContent.includes('experience')) {
                await this.handleAdditionalQuestions();
            }

            // Check for Next button
            const nextButton = await page.$('button[aria-label*="Next"], button[data-test-id="next-button"]');
            if (nextButton) {
                const isDisabled = await page.evaluate(btn => btn.disabled, nextButton);
                if (!isDisabled) {
                    await browserManager.humanLikeClick('button[aria-label*="Next"]');
                    await browserManager.humanLikeDelay(1000, 2000);
                    return { completed: false };
                }
            }

            // Check for Submit button (final step)
            const submitButton = await page.$('button[aria-label*="Submit"], button[data-test-id="submit-application"]');
            if (submitButton) {
                return { completed: true };
            }

            return { completed: false };

        } catch (error) {
            logger.error(`Error handling application step ${stepNumber}:`, error);
            return { failed: true, reason: 'Step handling error' };
        }
    }

    async fillContactInformation() {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Fill phone number if required
            const phoneInput = await page.$('input[name*="phone"], input[aria-label*="phone"]');
            if (phoneInput) {
                const phoneNumber = process.env.PHONE_NUMBER || '555-0123';
                await browserManager.humanLikeType('input[name*="phone"]', phoneNumber);
            }

            // Fill address if required
            const addressInput = await page.$('input[name*="address"], input[aria-label*="address"]');
            if (addressInput) {
                const address = process.env.ADDRESS || 'United States';
                await browserManager.humanLikeType('input[name*="address"]', address);
            }

            logger.info('Contact information filled');

        } catch (error) {
            logger.error('Error filling contact information:', error);
        }
    }

    async handleResumeUpload() {
        try {
            const page = this.auth.getBrowserManager().getPage();

            // Check if CV file exists
            if (!fs.existsSync(this.cvPath)) {
                logger.warn('CV file not found, skipping upload');
                return;
            }

            // Find file upload input
            const fileInput = await page.$('input[type="file"]');
            if (fileInput) {
                await fileInput.uploadFile(this.cvPath);
                await this.auth.getBrowserManager().humanLikeDelay(2000, 3000);
                logger.info('Resume uploaded');
            }

        } catch (error) {
            logger.error('Error uploading resume:', error);
        }
    }

    async handleCoverLetter(job) {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Find cover letter textarea
            const coverLetterTextarea = await page.$('textarea[name*="cover"], textarea[aria-label*="cover"]');
            if (coverLetterTextarea) {
                const coverLetter = await this.generateCoverLetter(job);
                await browserManager.humanLikeType('textarea[name*="cover"]', coverLetter);
                logger.info('Cover letter filled');
            }

        } catch (error) {
            logger.error('Error handling cover letter:', error);
        }
    }

    async generateCoverLetter(job) {
        try {
            let template = 'I am interested in this position and believe my skills would be a great fit for your team.';
            
            // Try to load template from file
            if (fs.existsSync(this.coverLetterTemplate)) {
                template = fs.readFileSync(this.coverLetterTemplate, 'utf8');
            }

            // Replace placeholders
            const coverLetter = template
                .replace(/{company}/g, job.company)
                .replace(/{position}/g, job.title)
                .replace(/{location}/g, job.location || '')
                .replace(/{date}/g, new Date().toLocaleDateString());

            return coverLetter;

        } catch (error) {
            logger.error('Error generating cover letter:', error);
            return 'I am interested in this position and believe my skills would be a great fit for your team.';
        }
    }

    async handleAdditionalQuestions() {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Handle common question types
            const questions = await page.$$('.application-question, .jobs-easy-apply-form-element');
            
            for (const question of questions) {
                const questionType = await this.identifyQuestionType(question);
                await this.answerQuestion(question, questionType);
                await browserManager.humanLikeDelay(500, 1000);
            }

        } catch (error) {
            logger.error('Error handling additional questions:', error);
        }
    }

    async identifyQuestionType(questionElement) {
        try {
            const page = this.auth.getBrowserManager().getPage();
            
            const questionText = await page.evaluate(el => el.innerText.toLowerCase(), questionElement);
            
            if (questionText.includes('experience') || questionText.includes('years')) {
                return 'experience';
            } else if (questionText.includes('authorized') || questionText.includes('visa')) {
                return 'work_authorization';
            } else if (questionText.includes('relocate') || questionText.includes('willing to move')) {
                return 'relocation';
            } else if (questionText.includes('salary') || questionText.includes('compensation')) {
                return 'salary';
            } else if (questionText.includes('notice') || questionText.includes('start date')) {
                return 'start_date';
            }
            
            return 'general';

        } catch (error) {
            logger.error('Error identifying question type:', error);
            return 'general';
        }
    }

    async answerQuestion(questionElement, questionType) {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Handle different input types within the question
            const textInput = await questionElement.$('input[type="text"], textarea');
            const selectInput = await questionElement.$('select');
            const radioInputs = await questionElement.$$('input[type="radio"]');

            if (textInput) {
                const answer = this.getAnswerForQuestionType(questionType);
                await page.evaluate((el, value) => {
                    el.value = value;
                    el.dispatchEvent(new Event('input', { bubbles: true }));
                }, textInput, answer);
            } else if (selectInput) {
                // Select the first reasonable option
                await page.evaluate(select => {
                    select.selectedIndex = 1; // Usually skip the placeholder option
                    select.dispatchEvent(new Event('change', { bubbles: true }));
                }, selectInput);
            } else if (radioInputs.length > 0) {
                // Select the first radio option (usually "Yes")
                await radioInputs[0].click();
            }

        } catch (error) {
            logger.error('Error answering question:', error);
        }
    }

    getAnswerForQuestionType(questionType) {
        const answers = {
            experience: '3',
            work_authorization: 'Yes',
            relocation: 'Yes',
            salary: '60000',
            start_date: '2 weeks',
            general: 'Yes'
        };

        return answers[questionType] || 'Yes';
    }

    async handleRegularApply(job) {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Click regular apply button
            await browserManager.humanLikeClick('.jobs-apply-button');
            await browserManager.humanLikeDelay(2000, 3000);

            // This will usually redirect to the company's website
            // We'll just record that we attempted to apply
            const currentUrl = page.url();
            
            return { 
                success: true, 
                applicationId: `external_apply_${Date.now()}`, 
                method: 'external_redirect',
                redirectUrl: currentUrl
            };

        } catch (error) {
            logger.error('Error handling regular apply:', error);
            return { success: false, reason: 'Regular apply error', error: error.message };
        }
    }

    async recordApplication(job, applicationResult) {
        try {
            // Insert application record
            await this.database.insertApplication({
                jobId: job.job_id,
                applicationId: applicationResult.applicationId,
                status: 'Applied',
                appliedAt: new Date().toISOString(),
                notes: `Auto-applied via ${applicationResult.method}`
            });

            // Mark job as applied
            await this.database.run(
                'UPDATE jobs SET is_applied = TRUE WHERE job_id = ?',
                [job.job_id]
            );

            logger.info(`Recorded application for job: ${job.job_id}`);

        } catch (error) {
            logger.error('Error recording application:', error);
            throw error;
        }
    }

    async getApplicationFilters() {
        try {
            const filters = await this.database.all(`
                SELECT * FROM search_filters 
                WHERE is_active = TRUE 
                ORDER BY last_used DESC
            `);

            return filters.length > 0 ? filters[0] : null;

        } catch (error) {
            logger.error('Error getting application filters:', error);
            return null;
        }
    }

    async logApplicationSession(type, status, itemsProcessed, errorsCount, startTime, errorMessage = null) {
        try {
            const duration = Date.now() - startTime;
            await this.database.run(
                `INSERT INTO scraping_logs 
                (type, status, items_processed, errors_count, duration_ms, completed_at, error_message)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
                [type, status, itemsProcessed, errorsCount, duration, errorMessage]
            );
        } catch (error) {
            logger.error('Error logging application session:', error);
        }
    }

    async close() {
        await this.auth.close();
    }
}

module.exports = AutoApplicant;
