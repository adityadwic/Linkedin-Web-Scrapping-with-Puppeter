#!/usr/bin/env node

/**
 * Simple test to check if browser can launch with visible window
 */

require('dotenv').config();
const BrowserManager = require('./src/utils/browserManager');

async function testBrowser() {
    console.log('🧪 Testing browser launch...');
    console.log(`HEADLESS_MODE: ${process.env.HEADLESS_MODE}`);
    
    const browserManager = new BrowserManager();
    
    try {
        // Launch browser
        await browserManager.launch();
        console.log('✅ Browser launched successfully!');
        
        const page = browserManager.getPage();
        
        // Navigate to a simple page
        console.log('🌐 Navigating to Google...');
        await page.goto('https://www.google.com', { waitUntil: 'networkidle2' });
        console.log('✅ Navigation successful!');
        
        // Wait 5 seconds so you can see the browser
        console.log('⏳ Waiting 5 seconds (you should see the browser window)...');
        await new Promise(resolve => setTimeout(resolve, 5000));
        
        // Close browser
        await browserManager.close();
        console.log('✅ Browser closed successfully!');
        
    } catch (error) {
        console.error('❌ Browser test failed:', error);
    }
}

testBrowser();
