#!/usr/bin/env node

/**
 * Standalone script to scrape company information
 * Usage: node src/scripts/scrape-companies.js [company1,company2,...]
 */

require('dotenv').config();
const Database = require('../utils/database');
const CompanyScraper = require('../services/companyScraper');
const logger = require('../utils/logger');

async function main() {
    const database = new Database();
    const companyScraper = new CompanyScraper(database);

    try {
        console.log('🏢 Starting LinkedIn company scraping...');
        
        // Initialize database
        await database.initialize();
        
        // Get companies from command line arguments or use auto-discovery
        let companiesToScrape = null;
        if (process.argv[2]) {
            companiesToScrape = process.argv[2].split(',').map(c => c.trim());
            console.log(`📋 Scraping specific companies: ${companiesToScrape.join(', ')}`);
        } else {
            console.log('🔍 Auto-discovering companies from job listings...');
        }
        
        // Start scraping
        const results = await companyScraper.scrapeCompanies(companiesToScrape);
        
        console.log(`✅ Company scraping completed successfully!`);
        console.log(`🏢 Scraped ${results.scrapedCount} companies`);
        console.log(`❌ Encountered ${results.errorsCount} errors`);
        
        // Get and display company stats
        const stats = await companyScraper.getCompanyStats();
        
        console.log('\n📈 Company Statistics:');
        console.log(`🏢 Total Companies: ${stats.totalCompanies}`);
        
        if (stats.industrieDistribution.length > 0) {
            console.log('\n🏭 Top Industries:');
            stats.industrieDistribution.slice(0, 5).forEach((industry, index) => {
                console.log(`${index + 1}. ${industry.industry}: ${industry.count} companies`);
            });
        }

        if (stats.recentScrapes.length > 0) {
            console.log('\n🆕 Recently Scraped Companies:');
            stats.recentScrapes.forEach((company, index) => {
                console.log(`${index + 1}. ${company.company_name} (${company.industry || 'Unknown Industry'})`);
            });
        }

        // Ask if user wants to scrape recruiters for recent companies
        if (stats.recentScrapes.length > 0 && !process.env.HEADLESS_MODE) {
            console.log('\n🤝 Would you like to scrape recruiters for these companies? (y/n)');
            
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.once('data', async (data) => {
                const key = data.toString().toLowerCase();
                
                if (key === 'y') {
                    console.log('\n👥 Starting recruiter scraping...');
                    
                    for (const company of stats.recentScrapes.slice(0, 3)) {
                        try {
                            const recruiters = await companyScraper.scrapeRecruiters(company.company_name, 5);
                            console.log(`   Found ${recruiters.length} recruiters for ${company.company_name}`);
                        } catch (error) {
                            console.log(`   Error scraping recruiters for ${company.company_name}: ${error.message}`);
                        }
                    }
                    
                    console.log('✅ Recruiter scraping completed!');
                }
                
                await companyScraper.close();
                await database.close();
                process.exit(0);
            });
        } else {
            await companyScraper.close();
            await database.close();
        }

    } catch (error) {
        console.error('❌ Company scraping failed:', error.message);
        logger.error('Company scraping script failed:', error);
        process.exit(1);
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
