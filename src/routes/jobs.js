const express = require('express');
const router = express.Router();
const Database = require('../utils/database');

const database = new Database();

// Trigger job scraping manually
router.post('/scrape', async (req, res) => {
    try {
        // Initialize database connection if not already initialized
        if (!database.db) {
            await database.initialize();
        }

        const { keywords, locations, jobTypes, maxJobs, freshStart = true } = req.body;
        
        // Get JobScraper instance (we need to import it)
        const JobScraper = require('../services/jobScraper');
        const jobScraper = new JobScraper(database);

        // Custom filters from request body or use defaults
        const customFilters = {
            keywords: keywords || process.env.JOB_SEARCH_KEYWORDS?.split(',') || [],
            locations: locations || process.env.JOB_LOCATIONS?.split(',') || [],
            jobTypes: jobTypes || process.env.JOB_TYPES?.split(',') || [],
            maxJobs: maxJobs || parseInt(process.env.MAX_JOBS_PER_SCRAPE) || 50
        };

        // Start scraping asynchronously with fresh start option
        const scrapingPromise = jobScraper.scrapeJobsWithFreshStart(customFilters, freshStart);
        
        // Return immediate response
        res.json({ 
            message: 'Job scraping started successfully (fresh browser session)',
            filters: customFilters,
            freshStart: freshStart,
            status: 'running'
        });

        // Handle the scraping result in background
        scrapingPromise
            .then(results => {
                console.log(`✅ Manual job scraping completed: ${results.length} jobs scraped`);
            })
            .catch(error => {
                console.error('❌ Manual job scraping failed:', error);
            });

    } catch (error) {
        console.error('Error starting job scraping:', error);
        res.status(500).json({ error: 'Failed to start job scraping' });
    }
});

// Get all jobs with filtering and pagination
router.get('/', async (req, res) => {
    try {
        // Initialize database connection if not already initialized
        if (!database.db) {
            await database.initialize();
        }
        const {
            page = 1,
            limit = 20,
            company,
            location,
            jobType,
            appliedOnly,
            minMatchScore,
            search
        } = req.query;

        let query = 'SELECT * FROM jobs WHERE 1=1';
        const params = [];

        // Apply filters
        if (company) {
            query += ' AND LOWER(company) LIKE LOWER(?)';
            params.push(`%${company}%`);
        }

        if (location) {
            query += ' AND LOWER(location) LIKE LOWER(?)';
            params.push(`%${location}%`);
        }

        if (jobType) {
            query += ' AND LOWER(job_type) LIKE LOWER(?)';
            params.push(`%${jobType}%`);
        }

        if (appliedOnly === 'true') {
            query += ' AND is_applied = TRUE';
        } else if (appliedOnly === 'false') {
            query += ' AND is_applied = FALSE';
        }

        if (minMatchScore) {
            query += ' AND match_score >= ?';
            params.push(parseFloat(minMatchScore));
        }

        if (search) {
            query += ' AND (LOWER(title) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Add pagination
        const offset = (page - 1) * limit;
        query += ' ORDER BY scraped_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const jobs = await database.all(query, params);

        // Get total count for pagination
        let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total')
                              .replace(/ORDER BY.*LIMIT.*OFFSET.*/, '');
        const countParams = params.slice(0, -2); // Remove limit and offset params
        const { total } = await database.get(countQuery, countParams);

        res.json({
            jobs,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching jobs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get job by ID
router.get('/:id', async (req, res) => {
    try {
        const job = await database.get('SELECT * FROM jobs WHERE job_id = ?', [req.params.id]);
        
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        res.json(job);

    } catch (error) {
        console.error('Error fetching job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get job statistics
router.get('/stats/overview', async (req, res) => {
    try {
        const stats = await database.getJobStats();
        res.json(stats);

    } catch (error) {
        console.error('Error fetching job stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get top companies by job count
router.get('/stats/companies', async (req, res) => {
    try {
        const companies = await database.all(`
            SELECT company, COUNT(*) as job_count,
                   SUM(CASE WHEN is_applied = TRUE THEN 1 ELSE 0 END) as applied_count
            FROM jobs 
            GROUP BY company 
            ORDER BY job_count DESC 
            LIMIT 10
        `);

        res.json(companies);

    } catch (error) {
        console.error('Error fetching company stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get jobs by location
router.get('/stats/locations', async (req, res) => {
    try {
        const locations = await database.all(`
            SELECT location, COUNT(*) as job_count
            FROM jobs 
            WHERE location IS NOT NULL AND location != ''
            GROUP BY location 
            ORDER BY job_count DESC 
            LIMIT 10
        `);

        res.json(locations);

    } catch (error) {
        console.error('Error fetching location stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get recent jobs (last 24 hours)
router.get('/recent/today', async (req, res) => {
    try {
        const jobs = await database.all(`
            SELECT * FROM jobs 
            WHERE scraped_at >= datetime('now', '-1 day')
            ORDER BY scraped_at DESC
        `);

        res.json(jobs);

    } catch (error) {
        console.error('Error fetching recent jobs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Mark job as applied manually
router.patch('/:id/apply', async (req, res) => {
    try {
        const { applicationId, notes } = req.body;
        const jobId = req.params.id;

        // Check if job exists
        const job = await database.get('SELECT * FROM jobs WHERE job_id = ?', [jobId]);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Mark job as applied
        await database.run('UPDATE jobs SET is_applied = TRUE WHERE job_id = ?', [jobId]);

        // Add application record
        await database.insertApplication({
            jobId,
            applicationId: applicationId || `manual_${Date.now()}`,
            status: 'Applied',
            appliedAt: new Date().toISOString(),
            notes: notes || 'Manually marked as applied'
        });

        res.json({ message: 'Job marked as applied successfully' });

    } catch (error) {
        console.error('Error marking job as applied:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete job
router.delete('/:id', async (req, res) => {
    try {
        const jobId = req.params.id;

        // Check if job exists
        const job = await database.get('SELECT * FROM jobs WHERE job_id = ?', [jobId]);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Delete related applications first
        await database.run('DELETE FROM applications WHERE job_id = ?', [jobId]);
        
        // Delete job
        await database.run('DELETE FROM jobs WHERE job_id = ?', [jobId]);

        res.json({ message: 'Job deleted successfully' });

    } catch (error) {
        console.error('Error deleting job:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
