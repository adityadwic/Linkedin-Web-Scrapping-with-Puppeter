#!/usr/bin/env node

/**
 * Standalone script to scrape LinkedIn jobs
 * Usage: node src/scripts/scrape-jobs.js
 */

require('dotenv').config();
const Database = require('../utils/database');
const JobScraper = require('../services/jobScraper');
const logger = require('../utils/logger');

async function main() {
    const database = new Database();
    const jobScraper = new JobScraper(database);

    try {
        console.log('🔍 Starting LinkedIn job scraping...');
        
        // Initialize database
        await database.initialize();
        
        // Custom filters (optional)
        const customFilters = process.argv[2] ? JSON.parse(process.argv[2]) : null;
        
        // Start scraping
        const results = await jobScraper.scrapeJobs(customFilters);
        
        console.log(`✅ Job scraping completed successfully!`);
        console.log(`📊 Scraped ${results.length} jobs`);
        
        // Display summary
        if (results.length > 0) {
            console.log('\n📋 Sample of scraped jobs:');
            results.slice(0, 5).forEach((job, index) => {
                console.log(`${index + 1}. ${job.title} at ${job.company} (${job.location})`);
            });
            
            if (results.length > 5) {
                console.log(`   ... and ${results.length - 5} more jobs`);
            }
        }

    } catch (error) {
        console.error('❌ Job scraping failed:', error.message);
        logger.error('Job scraping script failed:', error);
        process.exit(1);
    } finally {
        await jobScraper.close();
        await database.close();
    }
}

// Handle script interruption
process.on('SIGINT', async () => {
    console.log('\n🛑 Script interrupted by user');
    process.exit(0);
});

process.on('SIGTERM', async () => {
    console.log('\n🛑 Script terminated');
    process.exit(0);
});

// Run the script
if (require.main === module) {
    main().catch(console.error);
}
