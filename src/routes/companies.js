const express = require('express');
const router = express.Router();
const Database = require('../utils/database');

const database = new Database();

// Trigger company scraping manually
router.post('/scrape', async (req, res) => {
    try {
        // Initialize database connection if not already initialized
        if (!database.db) {
            await database.initialize();
        }

        const { companyNames } = req.body;

        // Get CompanyScraper instance
        const CompanyScraper = require('../services/companyScraper');
        const companyScraper = new CompanyScraper(database);

        // Start scraping asynchronously
        const scrapingPromise = companyScraper.scrapeCompanies(companyNames);
        
        // Return immediate response
        res.json({ 
            message: 'Company scraping started successfully',
            targetCompanies: companyNames || 'auto-discovered',
            status: 'running'
        });

        // Handle the scraping result in background
        scrapingPromise
            .then(results => {
                console.log(`✅ Manual company scraping completed: ${results.scraped} companies updated`);
            })
            .catch(error => {
                console.error('❌ Manual company scraping failed:', error);
            });

    } catch (error) {
        console.error('Error starting company scraping:', error);
        res.status(500).json({ error: 'Failed to start company scraping' });
    }
});

// Get all companies with filtering and pagination
router.get('/', async (req, res) => {
    try {
        // Initialize database connection if not already initialized
        if (!database.db) {
            await database.initialize();
        }
        const {
            page = 1,
            limit = 20,
            industry,
            size,
            location,
            search
        } = req.query;

        let query = 'SELECT * FROM companies WHERE 1=1';
        const params = [];

        // Apply filters
        if (industry) {
            query += ' AND LOWER(industry) LIKE LOWER(?)';
            params.push(`%${industry}%`);
        }

        if (size) {
            query += ' AND LOWER(size) LIKE LOWER(?)';
            params.push(`%${size}%`);
        }

        if (location) {
            query += ' AND LOWER(location) LIKE LOWER(?)';
            params.push(`%${location}%`);
        }

        if (search) {
            query += ' AND (LOWER(company_name) LIKE LOWER(?) OR LOWER(description) LIKE LOWER(?))';
            params.push(`%${search}%`, `%${search}%`);
        }

        // Add pagination
        const offset = (page - 1) * limit;
        query += ' ORDER BY scraped_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const companies = await database.all(query, params);

        // Get total count for pagination
        let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total')
                              .replace(/ORDER BY.*LIMIT.*OFFSET.*/, '');
        const countParams = params.slice(0, -2);
        const { total } = await database.get(countQuery, countParams);

        res.json({
            companies,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching companies:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get company by name
router.get('/:name', async (req, res) => {
    try {
        const companyName = decodeURIComponent(req.params.name);
        const company = await database.get('SELECT * FROM companies WHERE company_name = ?', [companyName]);
        
        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Parse specialties if they exist
        if (company.specialties) {
            try {
                company.specialties = JSON.parse(company.specialties);
            } catch {
                company.specialties = [];
            }
        }

        res.json(company);

    } catch (error) {
        console.error('Error fetching company:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get company statistics
router.get('/stats/overview', async (req, res) => {
    try {
        const stats = {};

        // Total companies
        stats.total = (await database.get('SELECT COUNT(*) as count FROM companies')).count;

        // Companies by industry
        stats.byIndustry = await database.all(`
            SELECT industry, COUNT(*) as count 
            FROM companies 
            WHERE industry IS NOT NULL AND industry != ''
            GROUP BY industry 
            ORDER BY count DESC 
            LIMIT 10
        `);

        // Companies by size
        stats.bySize = await database.all(`
            SELECT size, COUNT(*) as count 
            FROM companies 
            WHERE size IS NOT NULL AND size != ''
            GROUP BY size 
            ORDER BY count DESC
        `);

        // Recent companies (last 7 days)
        stats.recent = (await database.get(`
            SELECT COUNT(*) as count 
            FROM companies 
            WHERE scraped_at >= datetime('now', '-7 days')
        `)).count;

        res.json(stats);

    } catch (error) {
        console.error('Error fetching company stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get jobs for a specific company
router.get('/:name/jobs', async (req, res) => {
    try {
        const companyName = decodeURIComponent(req.params.name);
        const {
            page = 1,
            limit = 20,
            appliedOnly
        } = req.query;

        let query = 'SELECT * FROM jobs WHERE company = ?';
        const params = [companyName];

        if (appliedOnly === 'true') {
            query += ' AND is_applied = TRUE';
        } else if (appliedOnly === 'false') {
            query += ' AND is_applied = FALSE';
        }

        // Add pagination
        const offset = (page - 1) * limit;
        query += ' ORDER BY scraped_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const jobs = await database.all(query, params);

        // Get total count
        let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total')
                              .replace(/ORDER BY.*LIMIT.*OFFSET.*/, '');
        const countParams = params.slice(0, -2);
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
        console.error('Error fetching company jobs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get applications for a specific company
router.get('/:name/applications', async (req, res) => {
    try {
        const companyName = decodeURIComponent(req.params.name);
        const {
            page = 1,
            limit = 20,
            status
        } = req.query;

        let query = `
            SELECT a.*, j.title, j.location, j.url
            FROM applications a
            JOIN jobs j ON a.job_id = j.job_id
            WHERE j.company = ?
        `;
        const params = [companyName];

        if (status) {
            query += ' AND a.status = ?';
            params.push(status);
        }

        // Add pagination
        const offset = (page - 1) * limit;
        query += ' ORDER BY a.applied_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const applications = await database.all(query, params);

        // Get total count
        let countQuery = query.replace('SELECT a.*, j.title, j.location, j.url', 'SELECT COUNT(*) as total')
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
        console.error('Error fetching company applications:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get recruiters for a specific company
router.get('/:name/recruiters', async (req, res) => {
    try {
        const companyName = decodeURIComponent(req.params.name);
        const {
            page = 1,
            limit = 20
        } = req.query;

        let query = 'SELECT * FROM recruiters WHERE company = ?';
        const params = [companyName];

        // Add pagination
        const offset = (page - 1) * limit;
        query += ' ORDER BY scraped_at DESC LIMIT ? OFFSET ?';
        params.push(parseInt(limit), offset);

        const recruiters = await database.all(query, params);

        // Get total count
        let countQuery = query.replace('SELECT *', 'SELECT COUNT(*) as total')
                              .replace(/ORDER BY.*LIMIT.*OFFSET.*/, '');
        const countParams = params.slice(0, -2);
        const { total } = await database.get(countQuery, countParams);

        res.json({
            recruiters,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(total / limit),
                totalItems: total,
                itemsPerPage: parseInt(limit)
            }
        });

    } catch (error) {
        console.error('Error fetching company recruiters:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get industry distribution
router.get('/stats/industries', async (req, res) => {
    try {
        const industries = await database.all(`
            SELECT industry, COUNT(*) as company_count,
                   COUNT(DISTINCT j.job_id) as job_count,
                   COUNT(DISTINCT a.application_id) as application_count
            FROM companies c
            LEFT JOIN jobs j ON c.company_name = j.company
            LEFT JOIN applications a ON j.job_id = a.job_id
            WHERE c.industry IS NOT NULL AND c.industry != ''
            GROUP BY c.industry 
            ORDER BY company_count DESC 
            LIMIT 15
        `);

        res.json(industries);

    } catch (error) {
        console.error('Error fetching industry stats:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update company information
router.patch('/:name', async (req, res) => {
    try {
        const companyName = decodeURIComponent(req.params.name);
        const { industry, size, location, website, description } = req.body;

        // Check if company exists
        const company = await database.get('SELECT * FROM companies WHERE company_name = ?', [companyName]);
        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Build update query dynamically
        const updates = [];
        const params = [];

        if (industry !== undefined) {
            updates.push('industry = ?');
            params.push(industry);
        }
        if (size !== undefined) {
            updates.push('size = ?');
            params.push(size);
        }
        if (location !== undefined) {
            updates.push('location = ?');
            params.push(location);
        }
        if (website !== undefined) {
            updates.push('website = ?');
            params.push(website);
        }
        if (description !== undefined) {
            updates.push('description = ?');
            params.push(description);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(companyName);
        const query = `UPDATE companies SET ${updates.join(', ')} WHERE company_name = ?`;
        
        await database.run(query, params);

        res.json({ message: 'Company updated successfully' });

    } catch (error) {
        console.error('Error updating company:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete company
router.delete('/:name', async (req, res) => {
    try {
        const companyName = decodeURIComponent(req.params.name);

        // Check if company exists
        const company = await database.get('SELECT * FROM companies WHERE company_name = ?', [companyName]);
        if (!company) {
            return res.status(404).json({ error: 'Company not found' });
        }

        // Delete company (this won't delete jobs, just the company profile)
        await database.run('DELETE FROM companies WHERE company_name = ?', [companyName]);

        // Also delete related recruiters
        await database.run('DELETE FROM recruiters WHERE company = ?', [companyName]);

        res.json({ message: 'Company deleted successfully' });

    } catch (error) {
        console.error('Error deleting company:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create or update company manually
router.post('/', async (req, res) => {
    try {
        const { 
            name, 
            industry, 
            size, 
            location, 
            website, 
            description, 
            employeesCount, 
            foundedYear, 
            specialties 
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Company name is required' });
        }

        // Create company data object
        const companyData = {
            name,
            industry,
            size,
            location,
            website,
            description,
            employeesCount,
            foundedYear,
            specialties: specialties || []
        };

        // Insert or update company
        await database.insertCompany(companyData);

        res.status(201).json({ 
            message: 'Company created/updated successfully',
            company: companyData
        });

    } catch (error) {
        console.error('Error creating/updating company:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
