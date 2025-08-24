const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
require('dotenv').config();

const logger = require('./utils/logger');
const Database = require('./utils/database');
const JobScraper = require('./services/jobScraper');
const ApplicationTracker = require('./services/applicationTracker');
const CompanyScraper = require('./services/companyScraper');
const AutoApplicant = require('./services/autoApplicant');
const Scheduler = require('./services/scheduler');

class LinkedInAutomationApp {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.database = new Database();
        this.jobScraper = new JobScraper(this.database);
        this.applicationTracker = new ApplicationTracker(this.database);
        this.companyScraper = new CompanyScraper(this.database);
        this.autoApplicant = new AutoApplicant(this.database);
        this.scheduler = new Scheduler({
            jobScraper: this.jobScraper,
            applicationTracker: this.applicationTracker,
            companyScraper: this.companyScraper,
            autoApplicant: this.autoApplicant
        });
    }

    async initialize() {
        try {
            // Initialize database
            await this.database.initialize();
            logger.info('Database initialized successfully');

            // Setup Express middleware
            this.setupMiddleware();
            this.setupRoutes();

            // Start scheduler
            await this.scheduler.start();
            logger.info('Scheduler started successfully');

            // Start server
            this.app.listen(this.port, () => {
                logger.info(`LinkedIn Automation Tool started on port ${this.port}`);
                console.log(`🚀 Server running at http://localhost:${this.port}`);
                console.log(`📊 Dashboard: http://localhost:${this.port}/dashboard`);
                console.log(`📋 API Documentation: http://localhost:${this.port}/api-docs`);
            });

        } catch (error) {
            logger.error('Failed to initialize application:', error);
            process.exit(1);
        }
    }

    setupMiddleware() {
        this.app.use(helmet());
        this.app.use(cors());
        this.app.use(express.json());
        this.app.use(express.static(path.join(__dirname, '../public')));

        // Logging middleware
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path} - ${req.ip}`);
            next();
        });
    }

    setupRoutes() {
        // API Routes
        this.app.use('/api/jobs', require('./routes/jobs'));
        this.app.use('/api/applications', require('./routes/applications'));
        this.app.use('/api/companies', require('./routes/companies'));
        this.app.use('/api/settings', require('./routes/settings'));
        this.app.use('/api/dashboard', require('./routes/dashboard'));

        // Dashboard route
        this.app.get('/dashboard', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/dashboard.html'));
        });

        // Health check
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime()
            });
        });

        // API Health check
        this.app.get('/api/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                database: 'connected',
                services: 'operational'
            });
        });

        // API documentation
        this.app.get('/api-docs', (req, res) => {
            res.sendFile(path.join(__dirname, '../public/api-docs.html'));
        });

        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({ error: 'Route not found' });
        });

        // Error handler
        this.app.use((error, req, res, next) => {
            logger.error('Express error:', error);
            res.status(500).json({ error: 'Internal server error' });
        });
    }

    async shutdown() {
        logger.info('Shutting down application...');
        
        try {
            await this.scheduler.stop();
            await this.database.close();
            logger.info('Application shutdown complete');
            process.exit(0);
        } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT. Shutting down gracefully...');
    if (global.app) {
        await global.app.shutdown();
    }
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM. Shutting down gracefully...');
    if (global.app) {
        await global.app.shutdown();
    }
});

// Start the application
if (require.main === module) {
    const app = new LinkedInAutomationApp();
    global.app = app;
    app.initialize().catch(console.error);
}

module.exports = LinkedInAutomationApp;
