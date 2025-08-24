const express = require('express');
const router = express.Router();
const Database = require('../utils/database');

const database = new Database();

// Trigger application tracking manually
router.post('/track', async (req, res) => {
    try {
        // Initialize database connection if not already initialized
        if (!database.db) {
            await database.initialize();
        }

        // Get ApplicationTracker instance
        const ApplicationTracker = require('../services/applicationTracker');
        const applicationTracker = new ApplicationTracker(database);

        // Start tracking asynchronously
        const trackingPromise = applicationTracker.trackApplications();
        
        // Return immediate response
        res.json({ 
            message: 'Application tracking started successfully',
            status: 'running'
        });

        // Handle the tracking result in background
        trackingPromise
            .then(results => {
                console.log(`✅ Manual application tracking completed: ${results.updated} applications updated`);
            })
            .catch(error => {
                console.error('❌ Manual application tracking failed:', error);
            });

    } catch (error) {
        console.error('Error starting application tracking:', error);
        res.status(500).json({ error: 'Failed to start application tracking' });
    }
});

// Get all applications with filtering and pagination
router.get('/', async (req, res) => {
    try {
        // Initialize database connection if not already initialized
        if (!database.db) {
            await database.initialize();
        }
        const {
            page = 1,
            limit = 20,
            status,
            company,
            search
        } = req.query;

        let query = `
            SELECT a.*, j.title, j.company, j.location, j.url
            FROM applications a
            JOIN jobs j ON a.job_id = j.job_id
            WHERE 1=1
        `;
        const params = [];

        // Apply filters
        if (status) {
            query += ' AND a.status = ?';
            params.push(status);
        }

        if (company) {
            query += ' AND LOWER(j.company) LIKE LOWER(?)';
            params.push(`%${company}%`);
        }

        if (search) {
            query += ' AND (LOWER(j.title) LIKE LOWER(?) OR LOWER(j.company) LIKE LOWER(?))';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Add pagination
        const offset = (page - 1) * limit;
        query += ' ORDER BY a.applied_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const applications = await database.all(query, params);

        // Get total count
        let countQuery = query.replace('SELECT a.*, j.title, j.company, j.location, j.url', 'SELECT COUNT(*) as total')
                              .replace(/ORDER BY.*LIMIT.*OFFSET.*/, '');
        const countParams = params.slice(0, -2);
        const { total } = await database.get(countQuery, countParams);

        res.json({
            applications,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching applications:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get application by ID
router.get('/:id', async (req, res) => {
    try {
        const application = await database.get(`
            SELECT a.*, j.title, j.company, j.location, j.url, j.description
            FROM applications a
            JOIN jobs j ON a.job_id = j.job_id
            WHERE a.application_id = ?
        `, [req.params.id]);
        
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        // Parse status history if it exists
        if (application.status_history) {
            try {
                application.status_history = JSON.parse(application.status_history);
            } catch {
                application.status_history = [];
            }
        }

        res.json(application);

    } catch (error) {
        console.error('Error fetching application:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get application statistics
router.get('/stats/overview', async (req, res) => {
    try {
        const stats = {};

        // Total applications
        stats.total = (await database.get('SELECT COUNT(*) as count FROM applications')).count;

        // Applications by status
        stats.byStatus = await database.all(`
            SELECT status, COUNT(*) as count 
            FROM applications 
            GROUP BY status 
            ORDER BY count DESC
        `);

        // Recent applications (last 7 days)
        stats.recent = (await database.get(`
            SELECT COUNT(*) as count 
            FROM applications 
            WHERE applied_at >= datetime('now', '-7 days')
        `)).count;

        // Response rate
        const viewed = (await database.get(`
            SELECT COUNT(*) as count 
            FROM applications 
            WHERE status NOT IN ('Applied', 'Not viewed')
        `)).count;
        
        stats.responseRate = stats.total > 0 ? ((viewed / stats.total) * 100).toFixed(2) : 0;

        // Applications this month
        stats.thisMonth = (await database.get(`
            SELECT COUNT(*) as count 
            FROM applications 
            WHERE strftime('%Y-%m', applied_at) = strftime('%Y-%m', 'now')
        `)).count;

        res.json(stats);

    } catch (error) {
        console.error('Error fetching application stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get application timeline (status changes over time)
router.get('/stats/timeline', async (req, res) => {
    try {
        const timeline = await database.all(`
            SELECT DATE(applied_at) as date, COUNT(*) as applications
            FROM applications 
            WHERE applied_at >= datetime('now', '-30 days')
            GROUP BY DATE(applied_at)
            ORDER BY date ASC
        `);

        res.json(timeline);

    } catch (error) {
        console.error('Error fetching application timeline:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get applications by company
router.get('/stats/companies', async (req, res) => {
    try {
        const companies = await database.all(`
            SELECT j.company, COUNT(*) as application_count,
                   GROUP_CONCAT(DISTINCT a.status) as statuses
            FROM applications a
            JOIN jobs j ON a.job_id = j.job_id
            GROUP BY j.company 
            ORDER BY application_count DESC 
            LIMIT 10
        `);

        res.json(companies);

    } catch (error) {
        console.error('Error fetching company application stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update application status manually
router.patch('/:id/status', async (req, res) => {
    try {
        const { status, notes } = req.body;
        const applicationId = req.params.id;

        if (!status) {
            return res.status(400).json({ error: 'Status is required' });
        }

        // Get current application
        const application = await database.get('SELECT * FROM applications WHERE application_id = ?', [applicationId]);
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        // Parse existing status history
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
            status,
            timestamp: new Date().toISOString(),
            previousStatus: application.status,
            notes: notes || null
        });

        // Update application
        await database.run(`
            UPDATE applications 
            SET status = ?, last_checked = CURRENT_TIMESTAMP, status_history = ?, notes = ?
            WHERE application_id = ?
        `, [status, JSON.stringify(statusHistory), notes || application.notes, applicationId]);

        res.json({ message: 'Application status updated successfully' });

    } catch (error) {
        console.error('Error updating application status:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Add notes to application
router.patch('/:id/notes', async (req, res) => {
    try {
        const { notes } = req.body;
        const applicationId = req.params.id;

        if (!notes) {
            return res.status(400).json({ error: 'Notes are required' });
        }

        // Check if application exists
        const application = await database.get('SELECT * FROM applications WHERE application_id = ?', [applicationId]);
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        // Update notes
        await database.run('UPDATE applications SET notes = ? WHERE application_id = ?', [notes, applicationId]);

        res.json({ message: 'Application notes updated successfully' });

    } catch (error) {
        console.error('Error updating application notes:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete application
router.delete('/:id', async (req, res) => {
    try {
        const applicationId = req.params.id;

        // Check if application exists
        const application = await database.get('SELECT * FROM applications WHERE application_id = ?', [applicationId]);
        if (!application) {
            return res.status(404).json({ error: 'Application not found' });
        }

        // Delete application
        await database.run('DELETE FROM applications WHERE application_id = ?', [applicationId]);

        // Update job status
        await database.run('UPDATE jobs SET is_applied = FALSE WHERE job_id = ?', [application.job_id]);

        res.json({ message: 'Application deleted successfully' });

    } catch (error) {
        console.error('Error deleting application:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create manual application
router.post('/', async (req, res) => {
    try {
        const { jobId, status = 'Applied', notes, recruiterContact } = req.body;

        if (!jobId) {
            return res.status(400).json({ error: 'Job ID is required' });
        }

        // Check if job exists
        const job = await database.get('SELECT * FROM jobs WHERE job_id = ?', [jobId]);
        if (!job) {
            return res.status(404).json({ error: 'Job not found' });
        }

        // Check if application already exists
        const existingApplication = await database.get('SELECT * FROM applications WHERE job_id = ?', [jobId]);
        if (existingApplication) {
            return res.status(400).json({ error: 'Application already exists for this job' });
        }

        const applicationId = `manual_${Date.now()}`;

        // Create application
        await database.insertApplication({
            jobId,
            applicationId,
            status,
            appliedAt: new Date().toISOString(),
            recruiterContact,
            notes
        });

        // Mark job as applied
        await database.run('UPDATE jobs SET is_applied = TRUE WHERE job_id = ?', [jobId]);

        res.status(201).json({ 
            message: 'Application created successfully',
            applicationId 
        });

    } catch (error) {
        console.error('Error creating application:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
