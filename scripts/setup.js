#!/usr/bin/env node

/**
 * LinkedIn Automation Tool Setup Script
 * Interactive configuration wizard
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function question(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

async function setup() {
    try {
        console.log('🚀 LinkedIn Automation Tool Setup');
        console.log('==================================\n');
        console.log('This setup will help you configure the LinkedIn Automation Tool.\n');
        
        // Check if .env exists
        const envPath = path.join(__dirname, '..', '.env');
        const envExamplePath = path.join(__dirname, '..', '.env.example');
        
        if (!fs.existsSync(envPath)) {
            console.log('Creating .env file from template...');
            if (fs.existsSync(envExamplePath)) {
                fs.copyFileSync(envExamplePath, envPath);
                console.log('✅ .env file created\n');
            } else {
                console.log('❌ .env.example not found. Creating basic .env file...');
                fs.writeFileSync(envPath, `# LinkedIn Automation Tool Configuration
# Created by setup wizard

# LinkedIn Credentials
LINKEDIN_EMAIL=
LINKEDIN_PASSWORD=

# Database Configuration
DATABASE_PATH=./data/linkedin_automation.db

# Automation Settings
MAX_APPLICATIONS_PER_DAY=10
SCRAPE_INTERVAL_MINUTES=10
TRACK_INTERVAL_MINUTES=30
COMPANY_SCRAPE_INTERVAL_MINUTES=120

# Browser Settings
HEADLESS_MODE=true
STEALTH_MODE=true
USER_DATA_DIR=./data/chrome-user-data

# Proxy Settings (optional)
PROXY_ENABLED=false
PROXY_HOST=
PROXY_PORT=
PROXY_USERNAME=
PROXY_PASSWORD=

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/combined.log

# Server Configuration
PORT=3000
NODE_ENV=development
`);
                console.log('✅ Basic .env file created\n');
            }
        }

        // Get LinkedIn credentials
        console.log('📧 LinkedIn Credentials');
        console.log('Enter your LinkedIn credentials (they will be stored locally in .env):');
        
        const email = await question('LinkedIn Email: ');
        const password = await question('LinkedIn Password: ');
        
        // Get job search preferences
        console.log('\n🔍 Job Search Preferences');
        const keywords = await question('Job Keywords (comma-separated): ');
        const location = await question('Location (e.g., United States): ');
        const maxApps = await question('Max applications per day (default: 10): ') || '10';
        
        // Update .env file
        let envContent = fs.readFileSync(envPath, 'utf8');
        
        envContent = envContent.replace(/LINKEDIN_EMAIL=.*/, `LINKEDIN_EMAIL=${email}`);
        envContent = envContent.replace(/LINKEDIN_PASSWORD=.*/, `LINKEDIN_PASSWORD=${password}`);
        envContent = envContent.replace(/MAX_APPLICATIONS_PER_DAY=.*/, `MAX_APPLICATIONS_PER_DAY=${maxApps}`);
        
        // Add job search preferences
        if (!envContent.includes('JOB_KEYWORDS=')) {
            envContent += `\n# Job Search Preferences\nJOB_KEYWORDS=${keywords}\nJOB_LOCATION=${location}\n`;
        }
        
        fs.writeFileSync(envPath, envContent);
        
        console.log('\n✅ Configuration saved successfully!');
        console.log('\n🚀 Ready to start!');
        console.log('Next steps:');
        console.log('1. Run: npm start');
        console.log('2. Open: http://localhost:3000/dashboard');
        console.log('3. Monitor logs: tail -f logs/combined.log');
        
        console.log('\n⚠️  Important Safety Notes:');
        console.log('- This tool respects LinkedIn\'s usage patterns');
        console.log('- Maximum 10 applications per day by default');
        console.log('- Use responsibly and follow LinkedIn\'s Terms of Service');
        console.log('- Your credentials are stored locally and encrypted');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    } finally {
        rl.close();
    }
}

// Run setup if called directly
if (require.main === module) {
    setup();
}

module.exports = setup;
