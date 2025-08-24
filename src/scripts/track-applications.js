#!/usr/bin/env node

/**
 * Standalone script to track LinkedIn application status
 * Usage: node src/scripts/track-applications.js
 */

require('dotenv').config();
const Database = require('../utils/database');
const ApplicationTracker = require('../services/applicationTracker');
const logger = require('../utils/logger');

async function main() {
    const database = new Database();
    const applicationTracker = new ApplicationTracker(database);

    try {
        console.log('📊 Starting LinkedIn application tracking...');
        
        // Initialize database
        await database.initialize();
        
        // Start tracking
        const results = await applicationTracker.trackApplications();
        
        console.log(`✅ Application tracking completed successfully!`);
        console.log(`📊 Checked ${results.checkedCount} applications`);
        console.log(`🔄 Updated ${results.updatedCount} applications`);
        console.log(`❌ Encountered ${results.errorsCount} errors`);
        
        // Get and display application stats
        const stats = await applicationTracker.getApplicationStats();
        
        console.log('\n📈 Application Statistics:');
        console.log(`📬 Response Rate: ${stats.responseRate}%`);
        
        if (stats.statusDistribution.length > 0) {
            console.log('\n📋 Status Distribution:');
            stats.statusDistribution.forEach(status => {
                console.log(`   ${status.status}: ${status.count} applications`);
            });
        }

        if (stats.recentChanges.length > 0) {
            console.log('\n🆕 Recent Status Changes:');
            stats.recentChanges.slice(0, 5).forEach((change, index) => {
                console.log(`${index + 1}. ${change.title} at ${change.company} - ${change.status}`);
            });
        }

    } catch (error) {
        console.error('❌ Application tracking failed:', error.message);
        logger.error('Application tracking script failed:', error);
        process.exit(1);
    } finally {
        await applicationTracker.close();
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
