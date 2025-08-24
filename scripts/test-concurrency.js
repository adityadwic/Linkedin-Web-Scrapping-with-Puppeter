#!/usr/bin/env node

/**
 * High Concurrency Test Suite for LinkedIn Automation Tool
 * Tests system behavior under multiple simultaneous applications
 */

const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

class ConcurrencyTester {
    constructor(options = {}) {
        this.options = {
            workerCount: options.workerCount || 5,
            applicationsPerWorker: options.applicationsPerWorker || 3,
            testDuration: options.testDuration || 60000, // 1 minute
            staggerDelay: options.staggerDelay || 1000, // 1 second between worker starts
            ...options
        };
        
        this.results = {
            workers: [],
            summary: {
                totalAttempts: 0,
                successful: 0,
                failed: 0,
                timeouts: 0,
                errors: {}
            }
        };
    }

    async runConcurrencyTest() {
        console.log('🧪 Starting High Concurrency Test');
        console.log(`👥 Workers: ${this.options.workerCount}`);
        console.log(`📝 Applications per worker: ${this.options.applicationsPerWorker}`);
        console.log(`⏱️  Test duration: ${this.options.testDuration}ms`);
        console.log('='.repeat(60));

        const startTime = Date.now();
        const workers = [];
        const workerPromises = [];

        // Create and start workers with staggered timing
        for (let i = 0; i < this.options.workerCount; i++) {
            const workerPromise = new Promise((resolve, reject) => {
                setTimeout(() => {
                    const worker = new Worker(__filename, {
                        workerData: {
                            workerId: i,
                            applicationsToMake: this.options.applicationsPerWorker,
                            testDuration: this.options.testDuration,
                            startTime: Date.now()
                        }
                    });

                    const workerResult = {
                        id: i,
                        startTime: Date.now(),
                        applications: [],
                        errors: []
                    };

                    worker.on('message', (message) => {
                        if (message.type === 'application_result') {
                            workerResult.applications.push(message.data);
                            console.log(`Worker ${i}: ${message.data.status} - ${message.data.jobTitle}`);
                        } else if (message.type === 'error') {
                            workerResult.errors.push(message.data);
                            console.error(`Worker ${i} Error:`, message.data);
                        } else if (message.type === 'completed') {
                            workerResult.endTime = Date.now();
                            workerResult.duration = workerResult.endTime - workerResult.startTime;
                            console.log(`✅ Worker ${i} completed in ${workerResult.duration}ms`);
                            resolve(workerResult);
                        }
                    });

                    worker.on('error', (error) => {
                        workerResult.errors.push(error.message);
                        console.error(`❌ Worker ${i} crashed:`, error.message);
                        reject(error);
                    });

                    workers.push(worker);
                }, i * this.options.staggerDelay);
            });

            workerPromises.push(workerPromise);
        }

        // Wait for all workers to complete or timeout
        try {
            const results = await Promise.allSettled(workerPromises);
            
            results.forEach((result, index) => {
                if (result.status === 'fulfilled') {
                    this.results.workers.push(result.value);
                } else {
                    console.error(`Worker ${index} failed:`, result.reason);
                    this.results.workers.push({
                        id: index,
                        failed: true,
                        error: result.reason.message
                    });
                }
            });

        } catch (error) {
            console.error('Test execution failed:', error);
        }

        // Cleanup workers
        workers.forEach(worker => {
            if (!worker.killed) {
                worker.terminate();
            }
        });

        const totalDuration = Date.now() - startTime;
        this.generateReport(totalDuration);
    }

    generateReport(totalDuration) {
        console.log('\n' + '='.repeat(60));
        console.log('📊 CONCURRENCY TEST REPORT');
        console.log('='.repeat(60));

        // Calculate summary statistics
        let totalAttempts = 0;
        let successful = 0;
        let failed = 0;
        let timeouts = 0;
        const errorTypes = {};
        const applicationTimes = [];

        this.results.workers.forEach(worker => {
            if (worker.applications) {
                worker.applications.forEach(app => {
                    totalAttempts++;
                    if (app.status === 'success') {
                        successful++;
                        applicationTimes.push(app.duration);
                    } else if (app.status === 'timeout') {
                        timeouts++;
                    } else {
                        failed++;
                        const errorType = app.error || 'unknown';
                        errorTypes[errorType] = (errorTypes[errorType] || 0) + 1;
                    }
                });
            }
        });

        // Performance metrics
        const avgApplicationTime = applicationTimes.length > 0 
            ? applicationTimes.reduce((a, b) => a + b, 0) / applicationTimes.length 
            : 0;

        const successRate = totalAttempts > 0 ? (successful / totalAttempts * 100).toFixed(2) : 0;
        const timeoutRate = totalAttempts > 0 ? (timeouts / totalAttempts * 100).toFixed(2) : 0;

        console.log(`⏱️  Total Test Duration: ${totalDuration}ms`);
        console.log(`👥 Workers Launched: ${this.options.workerCount}`);
        console.log(`📝 Total Application Attempts: ${totalAttempts}`);
        console.log(`✅ Successful Applications: ${successful} (${successRate}%)`);
        console.log(`❌ Failed Applications: ${failed}`);
        console.log(`⏰ Timed Out Applications: ${timeouts} (${timeoutRate}%)`);
        console.log(`📈 Average Application Time: ${avgApplicationTime.toFixed(2)}ms`);

        if (Object.keys(errorTypes).length > 0) {
            console.log('\n🔍 Error Breakdown:');
            Object.entries(errorTypes).forEach(([error, count]) => {
                console.log(`  • ${error}: ${count} occurrences`);
            });
        }

        // Concurrency insights
        console.log('\n🧪 Concurrency Analysis:');
        const workerSuccessRates = this.results.workers.map(worker => {
            if (!worker.applications) return 0;
            const workerSuccessful = worker.applications.filter(app => app.status === 'success').length;
            return workerSuccessful / worker.applications.length * 100;
        });

        const avgWorkerSuccess = workerSuccessRates.reduce((a, b) => a + b, 0) / workerSuccessRates.length;
        console.log(`  • Average Worker Success Rate: ${avgWorkerSuccess.toFixed(2)}%`);
        console.log(`  • Worker Success Rate Range: ${Math.min(...workerSuccessRates).toFixed(2)}% - ${Math.max(...workerSuccessRates).toFixed(2)}%`);

        // Recommendations
        console.log('\n💡 Recommendations:');
        if (timeoutRate > 20) {
            console.log('  ⚠️  High timeout rate detected - consider increasing timeout values');
        }
        if (successful < totalAttempts * 0.5) {
            console.log('  ⚠️  Low success rate - check for resource contention or rate limiting');
        }
        if (avgApplicationTime > 30000) {
            console.log('  ⚠️  Slow application times - optimize page load waits and selectors');
        }

        console.log('='.repeat(60));
    }
}

// Worker thread code
if (!isMainThread) {
    const { workerId, applicationsToMake, testDuration, startTime } = workerData;
    
    // Simulate the application process
    async function simulateApplication(appIndex) {
        const applicationStart = Date.now();
        
        try {
            // Simulate variable application times (2-15 seconds)
            const applicationTime = Math.random() * 13000 + 2000;
            
            // Simulate random failures (20% failure rate in high concurrency)
            const shouldFail = Math.random() < 0.2;
            const shouldTimeout = Math.random() < 0.1;
            
            if (shouldTimeout) {
                // Simulate timeout after 30 seconds
                await new Promise(resolve => setTimeout(resolve, 30000));
                throw new Error('Application timeout');
            }
            
            if (shouldFail) {
                await new Promise(resolve => setTimeout(resolve, applicationTime / 2));
                throw new Error(['Rate limited', 'Session expired', 'Button not found', 'Form validation failed'][Math.floor(Math.random() * 4)]);
            }
            
            // Simulate successful application
            await new Promise(resolve => setTimeout(resolve, applicationTime));
            
            const result = {
                status: 'success',
                jobTitle: `Test Job ${workerId}-${appIndex}`,
                duration: Date.now() - applicationStart,
                timestamp: Date.now()
            };
            
            parentPort.postMessage({ type: 'application_result', data: result });
            
        } catch (error) {
            const result = {
                status: error.message.includes('timeout') ? 'timeout' : 'failed',
                jobTitle: `Test Job ${workerId}-${appIndex}`,
                duration: Date.now() - applicationStart,
                error: error.message,
                timestamp: Date.now()
            };
            
            parentPort.postMessage({ type: 'application_result', data: result });
        }
    }
    
    // Run applications for this worker
    (async () => {
        try {
            const applications = [];
            
            for (let i = 0; i < applicationsToMake; i++) {
                // Stagger applications within worker
                if (i > 0) {
                    await new Promise(resolve => setTimeout(resolve, Math.random() * 2000 + 1000));
                }
                
                applications.push(simulateApplication(i));
            }
            
            await Promise.all(applications);
            parentPort.postMessage({ type: 'completed' });
            
        } catch (error) {
            parentPort.postMessage({ type: 'error', data: error.message });
        }
    })();
}

// Run test if called directly
if (require.main === module && isMainThread) {
    const tester = new ConcurrencyTester({
        workerCount: process.argv[2] ? parseInt(process.argv[2]) : 5,
        applicationsPerWorker: process.argv[3] ? parseInt(process.argv[3]) : 3,
        testDuration: process.argv[4] ? parseInt(process.argv[4]) : 60000
    });
    
    tester.runConcurrencyTest().catch(console.error);
}

module.exports = ConcurrencyTester;
