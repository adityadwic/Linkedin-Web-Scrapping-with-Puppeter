const cron = require('node-cron');
const logger = require('../utils/logger');

class Scheduler {
    constructor(services) {
        this.jobScraper = services.jobScraper;
        this.applicationTracker = services.applicationTracker;
        this.companyScraper = services.companyScraper;
        this.autoApplicant = services.autoApplicant;
        this.jobs = new Map();
        this.isRunning = false;
    }

    async start() {
        if (this.isRunning) {
            logger.warn('Scheduler is already running');
            return;
        }

        logger.info('Starting scheduler...');
        this.isRunning = true;

        try {
            // Job scraping - every 10 minutes
            const scrapeInterval = process.env.SCRAPE_INTERVAL_MINUTES || 10;
            this.scheduleJobScraping(scrapeInterval);

            // Application tracking - every 30 minutes
            this.scheduleApplicationTracking(30);

            // Company scraping - every 2 hours
            this.scheduleCompanyScraping(120);

            // Auto application - every hour (if enabled)
            if (process.env.AUTO_APPLY_ENABLED === 'true') {
                this.scheduleAutoApplication(60);
            }

            // Daily cleanup and reports - at 2 AM
            this.scheduleDailyTasks();

            logger.info('All scheduled jobs configured successfully');

        } catch (error) {
            logger.error('Error starting scheduler:', error);
            this.isRunning = false;
            throw error;
        }
    }

    scheduleJobScraping(intervalMinutes) {
        const cronExpression = `*/${intervalMinutes} * * * *`;
        
        const job = cron.schedule(cronExpression, async () => {
            try {
                logger.info('Starting scheduled job scraping...');
                await this.jobScraper.scrapeJobs();
                logger.info('Scheduled job scraping completed');
            } catch (error) {
                logger.error('Scheduled job scraping failed:', error);
            }
        }, {
            scheduled: false,
            name: 'jobScraping'
        });

        this.jobs.set('jobScraping', job);
        job.start();
        
        logger.info(`Job scraping scheduled to run every ${intervalMinutes} minutes`);
    }

    scheduleApplicationTracking(intervalMinutes) {
        const cronExpression = `*/${intervalMinutes} * * * *`;
        
        const job = cron.schedule(cronExpression, async () => {
            try {
                logger.info('Starting scheduled application tracking...');
                await this.applicationTracker.trackApplications();
                logger.info('Scheduled application tracking completed');
            } catch (error) {
                logger.error('Scheduled application tracking failed:', error);
            }
        }, {
            scheduled: false,
            name: 'applicationTracking'
        });

        this.jobs.set('applicationTracking', job);
        job.start();
        
        logger.info(`Application tracking scheduled to run every ${intervalMinutes} minutes`);
    }

    scheduleCompanyScraping(intervalMinutes) {
        const cronExpression = `*/${intervalMinutes} * * * *`;
        
        const job = cron.schedule(cronExpression, async () => {
            try {
                logger.info('Starting scheduled company scraping...');
                await this.companyScraper.scrapeCompanies();
                logger.info('Scheduled company scraping completed');
            } catch (error) {
                logger.error('Scheduled company scraping failed:', error);
            }
        }, {
            scheduled: false,
            name: 'companyScraping'
        });

        this.jobs.set('companyScraping', job);
        job.start();
        
        logger.info(`Company scraping scheduled to run every ${intervalMinutes} minutes`);
    }

    scheduleAutoApplication(intervalMinutes) {
        const cronExpression = `*/${intervalMinutes} * * * *`;
        
        const job = cron.schedule(cronExpression, async () => {
            try {
                logger.info('Starting scheduled auto application...');
                
                // Only run during business hours (9 AM - 5 PM)
                const now = new Date();
                const hour = now.getHours();
                
                if (hour >= 9 && hour <= 17) {
                    await this.autoApplicant.autoApplyToJobs();
                    logger.info('Scheduled auto application completed');
                } else {
                    logger.info('Auto application skipped - outside business hours');
                }
            } catch (error) {
                logger.error('Scheduled auto application failed:', error);
            }
        }, {
            scheduled: false,
            name: 'autoApplication'
        });

        this.jobs.set('autoApplication', job);
        job.start();
        
        logger.info(`Auto application scheduled to run every ${intervalMinutes} minutes (business hours only)`);
    }

    scheduleDailyTasks() {
        // Daily tasks at 2 AM
        const job = cron.schedule('0 2 * * *', async () => {
            try {
                logger.info('Starting daily tasks...');
                
                // Generate daily report
                await this.generateDailyReport();
                
                // Clean up old data
                await this.cleanupOldData();
                
                // Reset daily counters
                await this.resetDailyCounters();
                
                logger.info('Daily tasks completed');
            } catch (error) {
                logger.error('Daily tasks failed:', error);
            }
        }, {
            scheduled: false,
            name: 'dailyTasks'
        });

        this.jobs.set('dailyTasks', job);
        job.start();
        
        logger.info('Daily tasks scheduled for 2:00 AM');
    }

    async generateDailyReport() {
        try {
            logger.info('Generating daily report...');
            
            const stats = await this.gatherDailyStats();
            
            // Log summary
            logger.info('Daily Report Summary:', {
                newJobs: stats.newJobs,
                applications: stats.applications,
                statusChanges: stats.statusChanges,
                companiesScraped: stats.companiesScraped
            });

            // You could extend this to send email reports, save to file, etc.
            
        } catch (error) {
            logger.error('Error generating daily report:', error);
        }
    }

    async gatherDailyStats() {
        try {
            const today = new Date().toISOString().split('T')[0];
            
            // New jobs scraped today
            const newJobs = await this.jobScraper.database.get(`
                SELECT COUNT(*) as count 
                FROM jobs 
                WHERE date(scraped_at) = date('now')
            `);

            // Applications submitted today
            const applications = await this.applicationTracker.database.get(`
                SELECT COUNT(*) as count 
                FROM applications 
                WHERE date(applied_at) = date('now')
            `);

            // Status changes today
            const statusChanges = await this.applicationTracker.database.get(`
                SELECT COUNT(*) as count 
                FROM applications 
                WHERE date(last_checked) = date('now')
                AND status_history IS NOT NULL
            `);

            // Companies scraped today
            const companiesScraped = await this.companyScraper.database.get(`
                SELECT COUNT(*) as count 
                FROM companies 
                WHERE date(scraped_at) = date('now')
            `);

            return {
                newJobs: newJobs.count,
                applications: applications.count,
                statusChanges: statusChanges.count,
                companiesScraped: companiesScraped.count
            };

        } catch (error) {
            logger.error('Error gathering daily stats:', error);
            return {
                newJobs: 0,
                applications: 0,
                statusChanges: 0,
                companiesScraped: 0
            };
        }
    }

    async cleanupOldData() {
        try {
            logger.info('Cleaning up old data...');
            
            const database = this.jobScraper.database;
            
            // Delete jobs older than 30 days that haven't been applied to
            await database.run(`
                DELETE FROM jobs 
                WHERE scraped_at < datetime('now', '-30 days')
                AND is_applied = FALSE
            `);

            // Delete old scraping logs (keep 90 days)
            await database.run(`
                DELETE FROM scraping_logs 
                WHERE started_at < datetime('now', '-90 days')
            `);

            // Clean up old application status history (keep 60 days of history)
            const oldApplications = await database.all(`
                SELECT application_id, status_history 
                FROM applications 
                WHERE last_checked < datetime('now', '-60 days')
                AND status_history IS NOT NULL
            `);

            for (const app of oldApplications) {
                try {
                    const history = JSON.parse(app.status_history);
                    const recentHistory = history.slice(-5); // Keep last 5 status changes
                    
                    await database.run(`
                        UPDATE applications 
                        SET status_history = ? 
                        WHERE application_id = ?
                    `, [JSON.stringify(recentHistory), app.application_id]);
                } catch (error) {
                    logger.error('Error cleaning application history:', error);
                }
            }

            logger.info('Old data cleanup completed');

        } catch (error) {
            logger.error('Error during data cleanup:', error);
        }
    }

    async resetDailyCounters() {
        try {
            logger.info('Resetting daily counters...');
            
            // Reset any daily counters in application settings
            const database = this.jobScraper.database;
            
            await database.run(`
                INSERT OR REPLACE INTO application_settings 
                (setting_key, setting_value, updated_at) 
                VALUES ('daily_applications_count', '0', CURRENT_TIMESTAMP)
            `);

            logger.info('Daily counters reset');

        } catch (error) {
            logger.error('Error resetting daily counters:', error);
        }
    }

    // Manual trigger methods for testing or immediate execution
    async triggerJobScraping() {
        try {
            logger.info('Manually triggering job scraping...');
            await this.jobScraper.scrapeJobs();
            logger.info('Manual job scraping completed');
        } catch (error) {
            logger.error('Manual job scraping failed:', error);
            throw error;
        }
    }

    async triggerApplicationTracking() {
        try {
            logger.info('Manually triggering application tracking...');
            await this.applicationTracker.trackApplications();
            logger.info('Manual application tracking completed');
        } catch (error) {
            logger.error('Manual application tracking failed:', error);
            throw error;
        }
    }

    async triggerCompanyScraping() {
        try {
            logger.info('Manually triggering company scraping...');
            await this.companyScraper.scrapeCompanies();
            logger.info('Manual company scraping completed');
        } catch (error) {
            logger.error('Manual company scraping failed:', error);
            throw error;
        }
    }

    async triggerAutoApplication() {
        try {
            logger.info('Manually triggering auto application...');
            await this.autoApplicant.autoApplyToJobs();
            logger.info('Manual auto application completed');
        } catch (error) {
            logger.error('Manual auto application failed:', error);
            throw error;
        }
    }

    pauseJob(jobName) {
        const job = this.jobs.get(jobName);
        if (job) {
            job.stop();
            logger.info(`Paused job: ${jobName}`);
        } else {
            logger.warn(`Job not found: ${jobName}`);
        }
    }

    resumeJob(jobName) {
        const job = this.jobs.get(jobName);
        if (job) {
            job.start();
            logger.info(`Resumed job: ${jobName}`);
        } else {
            logger.warn(`Job not found: ${jobName}`);
        }
    }

    getJobStatus() {
        const status = {};
        
        for (const [name, job] of this.jobs.entries()) {
            status[name] = {
                running: job.running || false,
                lastRun: job.lastDate || null,
                nextRun: job.nextDate || null
            };
        }
        
        return status;
    }

    async stop() {
        if (!this.isRunning) {
            logger.warn('Scheduler is not running');
            return;
        }

        logger.info('Stopping scheduler...');
        
        try {
            // Stop all scheduled jobs
            for (const [name, job] of this.jobs.entries()) {
                job.stop();
                logger.info(`Stopped job: ${name}`);
            }
            
            this.jobs.clear();
            this.isRunning = false;
            
            logger.info('Scheduler stopped successfully');

        } catch (error) {
            logger.error('Error stopping scheduler:', error);
            throw error;
        }
    }
}

module.exports = Scheduler;
