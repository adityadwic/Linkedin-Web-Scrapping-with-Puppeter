#!/usr/bin/env node

/**
 * LinkedIn Automation Tool - System Verification Script
 * Tests all major components and API endpoints
 */

const axios = require('axios').default;
const { spawn } = require('child_process');
const path = require('path');

const BASE_URL = 'http://localhost:3000';
const TEST_TIMEOUT = 30000; // 30 seconds

class SystemTester {
    constructor() {
        this.serverProcess = null;
        this.results = {
            server: false,
            database: false,
            api: false,
            dashboard: false,
            services: false
        };
    }

    async startServer() {
        console.log('🚀 Starting LinkedIn Automation Tool...');
        
        return new Promise((resolve, reject) => {
            this.serverProcess = spawn('node', ['src/index.js'], {
                cwd: path.join(__dirname, '..'),
                stdio: ['pipe', 'pipe', 'pipe']
            });

            let output = '';
            
            this.serverProcess.stdout.on('data', (data) => {
                output += data.toString();
                if (output.includes('Server running at http://localhost:3000')) {
                    console.log('✅ Server started successfully');
                    this.results.server = true;
                    setTimeout(resolve, 1000); // Give server time to fully initialize
                }
            });

            this.serverProcess.stderr.on('data', (data) => {
                console.error('Server Error:', data.toString());
            });

            this.serverProcess.on('error', (error) => {
                console.error('Failed to start server:', error);
                reject(error);
            });

            // Timeout after 15 seconds
            setTimeout(() => {
                if (!this.results.server) {
                    reject(new Error('Server startup timeout'));
                }
            }, 15000);
        });
    }

    async testAPI() {
        console.log('🔧 Testing API endpoints...');
        
        const endpoints = [
            { path: '/api/health', method: 'GET', name: 'Health Check' },
            { path: '/api/jobs', method: 'GET', name: 'Jobs API' },
            { path: '/api/applications', method: 'GET', name: 'Applications API' },
            { path: '/api/companies', method: 'GET', name: 'Companies API' },
            { path: '/api/dashboard/stats', method: 'GET', name: 'Dashboard Stats' }
        ];

        let passedTests = 0;

        for (const endpoint of endpoints) {
            try {
                const response = await axios({
                    method: endpoint.method,
                    url: `${BASE_URL}${endpoint.path}`,
                    timeout: 5000
                });

                if (response.status >= 200 && response.status < 300) {
                    console.log(`  ✅ ${endpoint.name}: ${response.status}`);
                    passedTests++;
                } else {
                    console.log(`  ❌ ${endpoint.name}: ${response.status}`);
                }
            } catch (error) {
                console.log(`  ❌ ${endpoint.name}: ${error.message}`);
            }
        }

        this.results.api = passedTests === endpoints.length;
        console.log(`📊 API Tests: ${passedTests}/${endpoints.length} passed`);
    }

    async testDashboard() {
        console.log('🎨 Testing web dashboard...');
        
        try {
            const response = await axios.get(`${BASE_URL}/dashboard`, {
                timeout: 5000
            });

            if (response.status === 200 && response.data.includes('LinkedIn Automation')) {
                console.log('  ✅ Dashboard accessible');
                this.results.dashboard = true;
            } else {
                console.log('  ❌ Dashboard content invalid');
            }
        } catch (error) {
            console.log(`  ❌ Dashboard error: ${error.message}`);
        }
    }

    async testDatabase() {
        console.log('💾 Testing database connectivity...');
        
        try {
            const response = await axios.get(`${BASE_URL}/api/dashboard/stats`, {
                timeout: 5000
            });

            if (response.status === 200 && response.data.stats) {
                console.log('  ✅ Database connected and responding');
                this.results.database = true;
            } else {
                console.log('  ❌ Database response invalid');
            }
        } catch (error) {
            console.log(`  ❌ Database error: ${error.message}`);
        }
    }

    async testServices() {
        console.log('⚙️ Testing core services...');
        
        const services = [
            { name: 'Browser Manager', test: () => this.testBrowserManager() },
            { name: 'Job Scraper', test: () => this.testJobScraper() },
            { name: 'Application Tracker', test: () => this.testApplicationTracker() },
            { name: 'Company Scraper', test: () => this.testCompanyScraper() }
        ];

        let passedServices = 0;

        for (const service of services) {
            try {
                const result = await service.test();
                if (result) {
                    console.log(`  ✅ ${service.name}: Initialized`);
                    passedServices++;
                } else {
                    console.log(`  ❌ ${service.name}: Failed`);
                }
            } catch (error) {
                console.log(`  ❌ ${service.name}: ${error.message}`);
            }
        }

        this.results.services = passedServices >= services.length * 0.75; // 75% pass rate
        console.log(`🔧 Services: ${passedServices}/${services.length} operational`);
    }

    async testBrowserManager() {
        // Test if browser manager can initialize (without actually launching browser)
        try {
            const BrowserManager = require('../src/utils/browserManager');
            const browserManager = new BrowserManager();
            return browserManager !== null;
        } catch (error) {
            return false;
        }
    }

    async testJobScraper() {
        // Test if job scraper can initialize
        try {
            const JobScraper = require('../src/services/jobScraper');
            const scraper = new JobScraper();
            return scraper !== null;
        } catch (error) {
            return false;
        }
    }

    async testApplicationTracker() {
        // Test if application tracker can initialize
        try {
            const ApplicationTracker = require('../src/services/applicationTracker');
            const tracker = new ApplicationTracker();
            return tracker !== null;
        } catch (error) {
            return false;
        }
    }

    async testCompanyScraper() {
        // Test if company scraper can initialize
        try {
            const CompanyScraper = require('../src/services/companyScraper');
            const scraper = new CompanyScraper();
            return scraper !== null;
        } catch (error) {
            return false;
        }
    }

    async stopServer() {
        if (this.serverProcess) {
            console.log('🛑 Stopping server...');
            this.serverProcess.kill('SIGTERM');
            
            return new Promise((resolve) => {
                this.serverProcess.on('exit', () => {
                    console.log('✅ Server stopped');
                    resolve();
                });
                
                // Force kill after 5 seconds
                setTimeout(() => {
                    this.serverProcess.kill('SIGKILL');
                    resolve();
                }, 5000);
            });
        }
    }

    generateReport() {
        console.log('\n' + '='.repeat(60));
        console.log('📋 SYSTEM VERIFICATION REPORT');
        console.log('='.repeat(60));
        
        const categories = [
            { name: 'Server Startup', status: this.results.server },
            { name: 'Database Connection', status: this.results.database },
            { name: 'API Endpoints', status: this.results.api },
            { name: 'Web Dashboard', status: this.results.dashboard },
            { name: 'Core Services', status: this.results.services }
        ];

        categories.forEach(category => {
            const status = category.status ? '✅ PASS' : '❌ FAIL';
            console.log(`${category.name.padEnd(20)} ${status}`);
        });

        const passedTests = Object.values(this.results).filter(Boolean).length;
        const totalTests = Object.keys(this.results).length;
        const successRate = Math.round((passedTests / totalTests) * 100);

        console.log('\n' + '-'.repeat(60));
        console.log(`Overall Success Rate: ${successRate}% (${passedTests}/${totalTests})`);
        
        if (successRate >= 80) {
            console.log('🎉 System is ready for production use!');
        } else if (successRate >= 60) {
            console.log('⚠️ System is functional but needs attention');
        } else {
            console.log('🚨 System has critical issues that need resolution');
        }

        console.log('\n📚 Next Steps:');
        console.log('1. Access dashboard: http://localhost:3000/dashboard');
        console.log('2. Configure LinkedIn credentials: npm run setup');
        console.log('3. Start automation: npm start');
        console.log('4. Monitor logs: tail -f logs/combined.log');
        
        console.log('\n💡 Troubleshooting:');
        console.log('- Check logs/ directory for detailed error information');
        console.log('- Ensure Node.js version 18+ is installed');
        console.log('- Verify all dependencies: npm install');
        console.log('- Review .env configuration file');
        
        console.log('='.repeat(60));
    }

    async runAllTests() {
        console.log('🔍 LinkedIn Automation Tool - System Verification');
        console.log('='.repeat(60));
        
        try {
            await this.startServer();
            
            // Wait a moment for server to stabilize
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            await this.testDatabase();
            await this.testAPI();
            await this.testDashboard();
            await this.testServices();
            
        } catch (error) {
            console.error('❌ Test execution failed:', error.message);
        } finally {
            await this.stopServer();
            this.generateReport();
        }
    }
}

// Run tests if called directly
if (require.main === module) {
    const tester = new SystemTester();
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
        console.log('\n🛑 Test interrupted by user');
        await tester.stopServer();
        process.exit(0);
    });
    
    tester.runAllTests().catch(error => {
        console.error('❌ Test suite failed:', error);
        process.exit(1);
    });
}

module.exports = SystemTester;
