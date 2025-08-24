const express = require('express');
const router = express.Router();
const Database = require('../utils/database');

const database = new Database();

// Get all application settings
router.get('/', async (req, res) => {
    try {
        const settings = await database.all('SELECT * FROM application_settings ORDER BY setting_key');
        
        // Convert to key-value object
        const settingsObject = {};
        settings.forEach(setting => {
            settingsObject[setting.setting_key] = setting.setting_value;
        });

        res.json(settingsObject);

    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get specific setting
router.get('/:key', async (req, res) => {
    try {
        const setting = await database.get(
            'SELECT * FROM application_settings WHERE setting_key = ?',
            [req.params.key]
        );
        
        if (!setting) {
            return res.status(404).json({ error: 'Setting not found' });
        }

        res.json({ 
            key: setting.setting_key, 
            value: setting.setting_value,
            updatedAt: setting.updated_at
        });

    } catch (error) {
        console.error('Error fetching setting:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update multiple settings
router.post('/', async (req, res) => {
    try {
        const settings = req.body;
        
        if (!settings || typeof settings !== 'object') {
            return res.status(400).json({ error: 'Settings object is required' });
        }

        // Update each setting
        for (const [key, value] of Object.entries(settings)) {
            await database.run(`
                INSERT OR REPLACE INTO application_settings 
                (setting_key, setting_value, updated_at) 
                VALUES (?, ?, CURRENT_TIMESTAMP)
            `, [key, String(value)]);
        }

        res.json({ message: 'Settings updated successfully' });

    } catch (error) {
        console.error('Error updating settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update specific setting
router.put('/:key', async (req, res) => {
    try {
        const { value } = req.body;
        const key = req.params.key;
        
        if (value === undefined) {
            return res.status(400).json({ error: 'Value is required' });
        }

        await database.run(`
            INSERT OR REPLACE INTO application_settings 
            (setting_key, setting_value, updated_at) 
            VALUES (?, ?, CURRENT_TIMESTAMP)
        `, [key, String(value)]);

        res.json({ message: 'Setting updated successfully' });

    } catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete setting
router.delete('/:key', async (req, res) => {
    try {
        const key = req.params.key;
        
        const result = await database.run(
            'DELETE FROM application_settings WHERE setting_key = ?',
            [key]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Setting not found' });
        }

        res.json({ message: 'Setting deleted successfully' });

    } catch (error) {
        console.error('Error deleting setting:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get search filters
router.get('/filters/search', async (req, res) => {
    try {
        const filters = await database.all(`
            SELECT * FROM search_filters 
            ORDER BY last_used DESC, created_at DESC
        `);

        // Parse JSON fields
        filters.forEach(filter => {
            try {
                filter.keywords = filter.keywords ? filter.keywords.split(',').map(k => k.trim()) : [];
                filter.locations = filter.locations ? filter.locations.split(',').map(l => l.trim()) : [];
                filter.job_types = filter.job_types ? filter.job_types.split(',').map(t => t.trim()) : [];
                filter.experience_levels = filter.experience_levels ? filter.experience_levels.split(',').map(e => e.trim()) : [];
            } catch (error) {
                console.error('Error parsing filter data:', error);
            }
        });

        res.json(filters);

    } catch (error) {
        console.error('Error fetching search filters:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Create search filter
router.post('/filters/search', async (req, res) => {
    try {
        const {
            name,
            keywords = [],
            locations = [],
            jobTypes = [],
            experienceLevels = [],
            salaryMin,
            salaryMax,
            isActive = true
        } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Filter name is required' });
        }

        await database.run(`
            INSERT INTO search_filters 
            (name, keywords, locations, job_types, experience_levels, salary_min, salary_max, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `, [
            name,
            Array.isArray(keywords) ? keywords.join(',') : keywords,
            Array.isArray(locations) ? locations.join(',') : locations,
            Array.isArray(jobTypes) ? jobTypes.join(',') : jobTypes,
            Array.isArray(experienceLevels) ? experienceLevels.join(',') : experienceLevels,
            salaryMin || null,
            salaryMax || null,
            isActive
        ]);

        res.status(201).json({ message: 'Search filter created successfully' });

    } catch (error) {
        console.error('Error creating search filter:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Update search filter
router.put('/filters/search/:id', async (req, res) => {
    try {
        const filterId = req.params.id;
        const {
            name,
            keywords,
            locations,
            jobTypes,
            experienceLevels,
            salaryMin,
            salaryMax,
            isActive
        } = req.body;

        // Check if filter exists
        const existingFilter = await database.get('SELECT * FROM search_filters WHERE id = ?', [filterId]);
        if (!existingFilter) {
            return res.status(404).json({ error: 'Search filter not found' });
        }

        // Build update query
        const updates = [];
        const params = [];

        if (name !== undefined) {
            updates.push('name = ?');
            params.push(name);
        }
        if (keywords !== undefined) {
            updates.push('keywords = ?');
            params.push(Array.isArray(keywords) ? keywords.join(',') : keywords);
        }
        if (locations !== undefined) {
            updates.push('locations = ?');
            params.push(Array.isArray(locations) ? locations.join(',') : locations);
        }
        if (jobTypes !== undefined) {
            updates.push('job_types = ?');
            params.push(Array.isArray(jobTypes) ? jobTypes.join(',') : jobTypes);
        }
        if (experienceLevels !== undefined) {
            updates.push('experience_levels = ?');
            params.push(Array.isArray(experienceLevels) ? experienceLevels.join(',') : experienceLevels);
        }
        if (salaryMin !== undefined) {
            updates.push('salary_min = ?');
            params.push(salaryMin);
        }
        if (salaryMax !== undefined) {
            updates.push('salary_max = ?');
            params.push(salaryMax);
        }
        if (isActive !== undefined) {
            updates.push('is_active = ?');
            params.push(isActive);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        params.push(filterId);
        const query = `UPDATE search_filters SET ${updates.join(', ')} WHERE id = ?`;
        
        await database.run(query, params);

        res.json({ message: 'Search filter updated successfully' });

    } catch (error) {
        console.error('Error updating search filter:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Delete search filter
router.delete('/filters/search/:id', async (req, res) => {
    try {
        const filterId = req.params.id;
        
        const result = await database.run('DELETE FROM search_filters WHERE id = ?', [filterId]);

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Search filter not found' });
        }

        res.json({ message: 'Search filter deleted successfully' });

    } catch (error) {
        console.error('Error deleting search filter:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Activate/deactivate search filter
router.patch('/filters/search/:id/toggle', async (req, res) => {
    try {
        const filterId = req.params.id;
        
        // Get current status
        const filter = await database.get('SELECT is_active FROM search_filters WHERE id = ?', [filterId]);
        if (!filter) {
            return res.status(404).json({ error: 'Search filter not found' });
        }

        // Toggle status
        const newStatus = !filter.is_active;
        await database.run('UPDATE search_filters SET is_active = ? WHERE id = ?', [newStatus, filterId]);

        res.json({ 
            message: `Search filter ${newStatus ? 'activated' : 'deactivated'} successfully`,
            isActive: newStatus
        });

    } catch (error) {
        console.error('Error toggling search filter:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Get environment variables and system settings
router.get('/system/info', async (req, res) => {
    try {
        const systemInfo = {
            autoApplyEnabled: process.env.AUTO_APPLY_ENABLED === 'true',
            maxApplicationsPerDay: parseInt(process.env.MAX_APPLICATIONS_PER_DAY) || 20,
            scrapeIntervalMinutes: parseInt(process.env.SCRAPE_INTERVAL_MINUTES) || 10,
            headlessMode: process.env.HEADLESS_MODE === 'true',
            useProxy: process.env.USE_PROXY === 'true',
            logLevel: process.env.LOG_LEVEL || 'info',
            nodeEnv: process.env.NODE_ENV || 'development'
        };

        res.json(systemInfo);

    } catch (error) {
        console.error('Error fetching system info:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Export settings
router.get('/export', async (req, res) => {
    try {
        const settings = await database.all('SELECT * FROM application_settings');
        const filters = await database.all('SELECT * FROM search_filters');
        
        const exportData = {
            timestamp: new Date().toISOString(),
            settings: {},
            searchFilters: filters
        };

        // Convert settings to object
        settings.forEach(setting => {
            exportData.settings[setting.setting_key] = setting.setting_value;
        });

        res.json(exportData);

    } catch (error) {
        console.error('Error exporting settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// Import settings
router.post('/import', async (req, res) => {
    try {
        const { settings, searchFilters } = req.body;
        
        if (!settings && !searchFilters) {
            return res.status(400).json({ error: 'No settings or filters to import' });
        }

        let importedCount = 0;

        // Import settings
        if (settings && typeof settings === 'object') {
            for (const [key, value] of Object.entries(settings)) {
                await database.run(`
                    INSERT OR REPLACE INTO application_settings 
                    (setting_key, setting_value, updated_at) 
                    VALUES (?, ?, CURRENT_TIMESTAMP)
                `, [key, String(value)]);
                importedCount++;
            }
        }

        // Import search filters
        if (searchFilters && Array.isArray(searchFilters)) {
            for (const filter of searchFilters) {
                await database.run(`
                    INSERT OR REPLACE INTO search_filters 
                    (name, keywords, locations, job_types, experience_levels, salary_min, salary_max, is_active)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                `, [
                    filter.name,
                    filter.keywords,
                    filter.locations,
                    filter.job_types,
                    filter.experience_levels,
                    filter.salary_min,
                    filter.salary_max,
                    filter.is_active
                ]);
                importedCount++;
            }
        }

        res.json({ 
            message: 'Settings imported successfully',
            importedCount
        });

    } catch (error) {
        console.error('Error importing settings:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
