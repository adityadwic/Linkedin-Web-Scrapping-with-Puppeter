const express = require('express');
const router = express.Router();

// Get dashboard stats (for system testing)
router.get('/stats', async (req, res) => {
    try {
        // Use a fresh database instance for this route
        const Database = require('../utils/database');
        const database = new Database();
        await database.initialize();

        const stats = {};

        // Job statistics
        const jobCount = await database.get('SELECT COUNT(*) as count FROM jobs');
        const appliedCount = await database.get('SELECT COUNT(*) as count FROM jobs WHERE is_applied = TRUE');
        const todayJobs = await database.get(`
            SELECT COUNT(*) as count FROM jobs 
            WHERE date(scraped_at) = date('now')
        `);

        stats.jobs = {
            total: jobCount?.count || 0,
            applied: appliedCount?.count || 0,
            today: todayJobs?.count || 0
        };

        // Application statistics  
        const appCount = await database.get('SELECT COUNT(*) as count FROM applications');
        const todayApps = await database.get(`
            SELECT COUNT(*) as count FROM applications 
            WHERE date(applied_at) = date('now')
        `);

        stats.applications = {
            total: appCount?.count || 0,
            today: todayApps?.count || 0
        };

        // Company statistics
        const companyCount = await database.get('SELECT COUNT(*) as count FROM companies');
        stats.companies = {
            total: companyCount?.count || 0
        };

        // System health
        stats.system = {
            status: 'healthy',
            uptime: process.uptime(),
            timestamp: new Date().toISOString()
        };

        await database.close();
        res.json({ stats });

    } catch (error) {
        console.error('Error fetching dashboard stats:', error);
        res.status(500).json({ 
            error: 'Internal server error', 
            stats: {
                jobs: { total: 0, applied: 0, today: 0 },
                applications: { total: 0, today: 0 },
                companies: { total: 0 },
                system: { status: 'error', uptime: process.uptime(), timestamp: new Date().toISOString() }
            }
        });
    }
});

// Create a shared database instance for other routes
const Database = require('../utils/database');
const database = new Database();

// Get dashboard overview
router.get('/overview', async (req, res) => {
    try {
        const overview = {};

        // Job statistics
        overview.jobs = {
            total: (await database.get('SELECT COUNT(*) as count FROM jobs')).count,
            applied: (await database.get('SELECT COUNT(*) as count FROM jobs WHERE is_applied = TRUE')).count,
            today: (await database.get(`
                SELECT COUNT(*) as count FROM jobs 
                WHERE date(scraped_at) = date('now')
            `)).count,
            thisWeek: (await database.get(`
                SELECT COUNT(*) as count FROM jobs 
                WHERE scraped_at >= datetime('now', '-7 days')
            `)).count
        };

        // Application statistics
        overview.applications = {
            total: (await database.get('SELECT COUNT(*) as count FROM applications')).count,
            today: (await database.get(`
                SELECT COUNT(*) as count FROM applications 
                WHERE date(applied_at) = date('now')
            `)).count,
            thisWeek: (await database.get(`
                SELECT COUNT(*) as count FROM applications 
                WHERE applied_at >= datetime('now', '-7 days')
            `)).count,
            thisMonth: (await database.get(`
                SELECT COUNT(*) as count FROM applications 
                WHERE strftime('%Y-%m', applied_at) = strftime('%Y-%m', 'now')
            `)).count
        };

        // Company statistics
        overview.companies = {
            total: (await database.get('SELECT COUNT(*) as count FROM companies')).count,
            scraped: (await database.get(`
                SELECT COUNT(*) as count FROM companies 
                WHERE scraped_at >= datetime('now', '-7 days')
            `)).count
        };

        // Response rate
        const viewedApplications = (await database.get(`
            SELECT COUNT(*) as count FROM applications 
            WHERE status NOT IN ('Applied', 'Not viewed')
        `)).count;
        
        overview.responseRate = overview.applications.total > 0 
            ? ((viewedApplications / overview.applications.total) * 100).toFixed(2)
            : 0;

        res.json(overview);

    } catch (error) {
        console.error('Error fetching dashboard overview:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get recent activity
router.get('/recent-activity', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        
        const activities = [];

        // Recent jobs
        const recentJobs = await database.all(`
            SELECT 'job_scraped' as type, title, company, scraped_at as timestamp, job_id as id
            FROM jobs 
            ORDER BY scraped_at DESC 
            LIMIT ?
        `, [Math.floor(limit / 2)]);

        // Recent applications
        const recentApplications = await database.all(`
            SELECT 'application_submitted' as type, j.title, j.company, a.applied_at as timestamp, a.application_id as id
            FROM applications a
            JOIN jobs j ON a.job_id = j.job_id
            ORDER BY a.applied_at DESC 
            LIMIT ?
        `, [Math.floor(limit / 2)]);

        // Combine and sort by timestamp
        activities.push(...recentJobs, ...recentApplications);
        activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.json(activities.slice(0, limit));

    } catch (error) {
        console.error('Error fetching recent activity:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get application status distribution
router.get('/application-status', async (req, res) => {
    try {
        const statusDistribution = await database.all(`
            SELECT status, COUNT(*) as count 
            FROM applications 
            GROUP BY status 
            ORDER BY count DESC
        `);

        res.json(statusDistribution);

    } catch (error) {
        console.error('Error fetching application status distribution:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get top companies by job count
router.get('/top-companies', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        
        const topCompanies = await database.all(`
            SELECT j.company, 
                   COUNT(*) as job_count,
                   COUNT(CASE WHEN j.is_applied = 1 THEN 1 END) as applied_count,
                   c.industry
            FROM jobs j
            LEFT JOIN companies c ON j.company = c.company_name
            GROUP BY j.company 
            ORDER BY job_count DESC 
            LIMIT ?
        `, [limit]);

        res.json(topCompanies);

    } catch (error) {
        console.error('Error fetching top companies:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get job scraping timeline (jobs scraped over time)
router.get('/scraping-timeline', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        
        const timeline = await database.all(`
            SELECT DATE(scraped_at) as date, COUNT(*) as jobs_scraped
            FROM jobs 
            WHERE scraped_at >= datetime('now', '-${days} days')
            GROUP BY DATE(scraped_at)
            ORDER BY date ASC
        `);

        res.json(timeline);

    } catch (error) {
        console.error('Error fetching scraping timeline:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get application timeline (applications over time)
router.get('/application-timeline', async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        
        const timeline = await database.all(`
            SELECT DATE(applied_at) as date, COUNT(*) as applications
            FROM applications 
            WHERE applied_at >= datetime('now', '-${days} days')
            GROUP BY DATE(applied_at)
            ORDER BY date ASC
        `);

        res.json(timeline);

    } catch (error) {
        console.error('Error fetching application timeline:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get job match score distribution
router.get('/match-scores', async (req, res) => {
    try {
        const matchScores = await database.all(`
            SELECT 
                CASE 
                    WHEN match_score >= 80 THEN 'Excellent (80-100%)'
                    WHEN match_score >= 60 THEN 'Good (60-79%)'
                    WHEN match_score >= 40 THEN 'Fair (40-59%)'
                    WHEN match_score >= 20 THEN 'Poor (20-39%)'
                    ELSE 'Very Poor (0-19%)'
                END as score_range,
                COUNT(*) as count
            FROM jobs 
            WHERE match_score IS NOT NULL
            GROUP BY score_range
            ORDER BY 
                CASE 
                    WHEN match_score >= 80 THEN 1
                    WHEN match_score >= 60 THEN 2
                    WHEN match_score >= 40 THEN 3
                    WHEN match_score >= 20 THEN 4
                    ELSE 5
                END
        `);

        res.json(matchScores);

    } catch (error) {
        console.error('Error fetching match score distribution:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get scraping performance logs
router.get('/scraping-logs', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const type = req.query.type; // 'job_scrape', 'application_check', 'company_scrape'
        
        let query = `
            SELECT type, status, items_processed, errors_count, duration_ms, 
                   started_at, completed_at, error_message
            FROM scraping_logs
        `;
        const params = [];

        if (type) {
            query += ' WHERE type = ?';
            params.push(type);
        }

        query += ' ORDER BY started_at DESC LIMIT ?';
        params.push(limit);

        const logs = await database.all(query, params);

        res.json(logs);

    } catch (error) {
        console.error('Error fetching scraping logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get location distribution
router.get('/locations', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        
        const locations = await database.all(`
            SELECT location, COUNT(*) as job_count
            FROM jobs 
            WHERE location IS NOT NULL AND location != ''
            GROUP BY location 
            ORDER BY job_count DESC 
            LIMIT ?
        `, [limit]);

        res.json(locations);

    } catch (error) {
        console.error('Error fetching location distribution:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get success metrics
router.get('/success-metrics', async (req, res) => {
    try {
        const metrics = {};

        // Calculate various success metrics
        const totalApplications = (await database.get('SELECT COUNT(*) as count FROM applications')).count;
        
        if (totalApplications > 0) {
            // Interview rate
            const interviews = (await database.get(`
                SELECT COUNT(*) as count FROM applications 
                WHERE LOWER(status) LIKE '%interview%'
            `)).count;
            metrics.interviewRate = ((interviews / totalApplications) * 100).toFixed(2);

            // Response rate (any status change from "Applied")
            const responses = (await database.get(`
                SELECT COUNT(*) as count FROM applications 
                WHERE status != 'Applied'
            `)).count;
            metrics.responseRate = ((responses / totalApplications) * 100).toFixed(2);

            // Rejection rate
            const rejections = (await database.get(`
                SELECT COUNT(*) as count FROM applications 
                WHERE LOWER(status) LIKE '%reject%'
            `)).count;
            metrics.rejectionRate = ((rejections / totalApplications) * 100).toFixed(2);

            // Application velocity (applications per day over last 30 days)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
            
            const recentApplications = (await database.get(`
                SELECT COUNT(*) as count FROM applications 
                WHERE applied_at >= datetime('now', '-30 days')
            `)).count;
            metrics.applicationVelocity = (recentApplications / 30).toFixed(2);

        } else {
            metrics.interviewRate = 0;
            metrics.responseRate = 0;
            metrics.rejectionRate = 0;
            metrics.applicationVelocity = 0;
        }

        // Job scraping effectiveness
        const totalJobs = (await database.get('SELECT COUNT(*) as count FROM jobs')).count;
        const appliedJobs = (await database.get('SELECT COUNT(*) as count FROM jobs WHERE is_applied = TRUE')).count;
        
        metrics.applicationConversionRate = totalJobs > 0 
            ? ((appliedJobs / totalJobs) * 100).toFixed(2)
            : 0;

        res.json(metrics);

    } catch (error) {
        console.error('Error fetching success metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
