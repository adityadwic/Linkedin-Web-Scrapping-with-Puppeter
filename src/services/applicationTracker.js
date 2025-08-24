const LinkedInAuth = require('./linkedinAuth');
const logger = require('../utils/logger');

class ApplicationTracker {
    constructor(database) {
        this.database = database;
        this.auth = new LinkedInAuth();
    }

    async trackApplications() {
        const startTime = Date.now();
        let checkedCount = 0;
        let updatedCount = 0;
        let errorsCount = 0;

        try {
            logger.info('Starting application tracking process');
            
            // Ensure we're logged in
            await this.auth.ensureLoggedIn();
            
            // Navigate to applications page
            await this.navigateToApplicationsPage();

            // Get all applications from database
            const applications = await this.database.all(
                'SELECT * FROM applications ORDER BY applied_at DESC'
            );

            logger.info(`Found ${applications.length} applications to track`);

            // Check each application status
            for (const application of applications) {
                try {
                    const statusUpdate = await this.checkApplicationStatus(application);
                    if (statusUpdate) {
                        await this.updateApplicationStatus(application, statusUpdate);
                        updatedCount++;
                    }
                    checkedCount++;
                    
                    // Add delay between checks
                    await this.auth.getBrowserManager().humanLikeDelay(2000, 4000);
                    
                } catch (error) {
                    logger.error(`Error checking application ${application.application_id}:`, error);
                    errorsCount++;
                }
            }

            // Log tracking session
            await this.logTrackingSession('application_check', 'success', checkedCount, errorsCount, updatedCount, startTime);
            
            logger.info(`Application tracking completed. Checked ${checkedCount}, updated ${updatedCount}, errors ${errorsCount}`);
            return { checkedCount, updatedCount, errorsCount };

        } catch (error) {
            logger.error('Application tracking failed:', error);
            await this.logTrackingSession('application_check', 'error', checkedCount, errorsCount, updatedCount, startTime, error.message);
            throw error;
        }
    }

    async navigateToApplicationsPage() {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const applicationsUrl = 'https://www.linkedin.com/my-items/saved-jobs/';
            
            logger.info('Navigating to applications page');
            await page.goto(applicationsUrl, { waitUntil: 'networkidle2' });
            await this.auth.getBrowserManager().waitForLinkedInLoad();

            // Try to find and click on "Applications" tab
            const applicationsTab = await page.$('button[data-test-id="applications-tab"], a[href*="applications"]');
            if (applicationsTab) {
                await this.auth.getBrowserManager().humanLikeClick('button[data-test-id="applications-tab"]');
                await this.auth.getBrowserManager().humanLikeDelay(2000, 3000);
            }
            
            return true;
        } catch (error) {
            logger.error('Failed to navigate to applications page:', error);
            throw error;
        }
    }

    async checkApplicationStatus(application) {
        try {
            const page = this.auth.getBrowserManager().getPage();
            const browserManager = this.auth.getBrowserManager();

            // Look for the specific application in the list
            const applicationElement = await this.findApplicationElement(application);
            
            if (!applicationElement) {
                logger.warn(`Application not found on page: ${application.application_id}`);
                return null;
            }

            // Extract current status
            const currentStatus = await this.extractApplicationStatus(applicationElement);
            
            if (currentStatus && currentStatus !== application.status) {
                logger.info(`Status change detected for ${application.application_id}: ${application.status} -> ${currentStatus}`);
                
                // Extract additional details
                const additionalDetails = await this.extractApplicationDetails(applicationElement);
                
                return {
                    status: currentStatus,
                    ...additionalDetails,
                    lastChecked: new Date().toISOString()
                };
            }

            // Update last checked time even if no status change
            await this.database.run(
                'UPDATE applications SET last_checked = CURRENT_TIMESTAMP WHERE application_id = ?',
                [application.application_id]
            );

            return null;

        } catch (error) {
            logger.error('Error checking application status:', error);
            throw error;
        }
    }

    async findApplicationElement(application) {
        try {
            const page = this.auth.getBrowserManager().getPage();

            // Try different selectors to find the application
            const selectors = [
                `[data-application-id="${application.application_id}"]`,
                `.application-item[data-job-id="${application.job_id}"]`,
                `.job-application-card`
            ];

            for (const selector of selectors) {
                const elements = await page.$$(selector);
                for (const element of elements) {
                    // Check if this element matches our application
                    const elementText = await page.evaluate(el => el.innerText, element);
                    
                    // Get job title from database to help identify
                    const job = await this.database.get(
                        'SELECT title, company FROM jobs WHERE job_id = ?',
                        [application.job_id]
                    );

                    if (job && elementText.includes(job.title) && elementText.includes(job.company)) {
                        return element;
                    }
                }
            }

            return null;

        } catch (error) {
            logger.error('Error finding application element:', error);
            return null;
        }
    }

    async extractApplicationStatus(applicationElement) {
        try {
            const page = this.auth.getBrowserManager().getPage();

            const status = await page.evaluate(element => {
                // Look for status indicators
                const statusElement = element.querySelector('.application-status, .job-application-status, [data-test-id="application-status"]');
                if (statusElement) {
                    return statusElement.innerText.trim();
                }

                // Look for status in badges or labels
                const badgeElement = element.querySelector('.badge, .label, .status-badge');
                if (badgeElement) {
                    return badgeElement.innerText.trim();
                }

                // Look for status text patterns
                const text = element.innerText;
                const statusPatterns = [
                    /Application viewed/i,
                    /Not viewed/i,
                    /Rejected/i,
                    /Shortlisted/i,
                    /Interview scheduled/i,
                    /Hired/i,
                    /Application submitted/i
                ];

                for (const pattern of statusPatterns) {
                    const match = text.match(pattern);
                    if (match) {
                        return match[0];
                    }
                }

                return 'Applied'; // Default status

            }, applicationElement);

            return status;

        } catch (error) {
            logger.error('Error extracting application status:', error);
            return null;
        }
    }

    async extractApplicationDetails(applicationElement) {
        try {
            const page = this.auth.getBrowserManager().getPage();

            const details = await page.evaluate(element => {
                const result = {};

                // Try to find recruiter contact info
                const recruiterElement = element.querySelector('.recruiter-name, .hiring-manager');
                if (recruiterElement) {
                    result.recruiterContact = recruiterElement.innerText.trim();
                }

                // Look for any additional notes or messages
                const notesElement = element.querySelector('.application-notes, .message-preview');
                if (notesElement) {
                    result.notes = notesElement.innerText.trim();
                }

                // Check for interview date/time
                const interviewElement = element.querySelector('.interview-date, .scheduled-interview');
                if (interviewElement) {
                    result.interviewDate = interviewElement.innerText.trim();
                }

                return result;

            }, applicationElement);

            return details;

        } catch (error) {
            logger.error('Error extracting application details:', error);
            return {};
        }
    }

    async updateApplicationStatus(application, statusUpdate) {
        try {
            // Get current status history
            let statusHistory = [];
            if (application.status_history) {
                try {
                    statusHistory = JSON.parse(application.status_history);
                } catch {
                    statusHistory = [];
                }
            }

            // Add new status to history
            statusHistory.push({
                status: statusUpdate.status,
                timestamp: statusUpdate.lastChecked,
                previousStatus: application.status
            });

            // Update database
            await this.database.run(
                `UPDATE applications 
                SET status = ?, last_checked = ?, status_history = ?, recruiter_contact = ?, notes = ?
                WHERE application_id = ?`,
                [
                    statusUpdate.status,
                    statusUpdate.lastChecked,
                    JSON.stringify(statusHistory),
                    statusUpdate.recruiterContact || application.recruiter_contact,
                    statusUpdate.notes || application.notes,
                    application.application_id
                ]
            );

            logger.info(`Updated application ${application.application_id} status to: ${statusUpdate.status}`);

        } catch (error) {
            logger.error('Error updating application status:', error);
            throw error;
        }
    }

    async getApplicationStats() {
        try {
            const stats = {};

            // Get status distribution
            stats.statusDistribution = await this.database.all(`
                SELECT status, COUNT(*) as count 
                FROM applications 
                GROUP BY status
                ORDER BY count DESC
            `);

            // Get recent status changes
            stats.recentChanges = await this.database.all(`
                SELECT a.*, j.title, j.company
                FROM applications a
                JOIN jobs j ON a.job_id = j.job_id
                WHERE a.last_checked >= datetime('now', '-7 days')
                AND a.status_history IS NOT NULL
                ORDER BY a.last_checked DESC
                LIMIT 10
            `);

            // Get response rate
            const totalApplications = await this.database.get(`
                SELECT COUNT(*) as count FROM applications
            `);

            const viewedApplications = await this.database.get(`
                SELECT COUNT(*) as count FROM applications 
                WHERE status NOT IN ('Applied', 'Not viewed')
            `);

            stats.responseRate = totalApplications.count > 0 
                ? (viewedApplications.count / totalApplications.count * 100).toFixed(2)
                : 0;

            return stats;

        } catch (error) {
            logger.error('Error getting application stats:', error);
            throw error;
        }
    }

    async addManualApplication(jobId, applicationData) {
        try {
            const applicationId = applicationData.applicationId || `manual_${Date.now()}`;
            
            await this.database.insertApplication({
                jobId,
                applicationId,
                status: applicationData.status || 'Applied',
                appliedAt: applicationData.appliedAt || new Date().toISOString(),
                recruiterContact: applicationData.recruiterContact,
                notes: applicationData.notes
            });

            // Mark job as applied
            await this.database.run(
                'UPDATE jobs SET is_applied = TRUE WHERE job_id = ?',
                [jobId]
            );

            logger.info(`Added manual application: ${applicationId}`);
            return applicationId;

        } catch (error) {
            logger.error('Error adding manual application:', error);
            throw error;
        }
    }

    async logTrackingSession(type, status, itemsProcessed, errorsCount, updatedCount, startTime, errorMessage = null) {
        try {
            const duration = Date.now() - startTime;
            await this.database.run(
                `INSERT INTO scraping_logs 
                (type, status, items_processed, errors_count, duration_ms, completed_at, error_message)
                VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
                [type, status, itemsProcessed, errorsCount, duration, errorMessage]
            );

            // Also log the updated count in a custom field (you might want to add this column)
            logger.info(`Tracking session logged: ${itemsProcessed} checked, ${updatedCount} updated`);

        } catch (error) {
            logger.error('Error logging tracking session:', error);
        }
    }

    async close() {
        await this.auth.close();
    }
}

module.exports = ApplicationTracker;
