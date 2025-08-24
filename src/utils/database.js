const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

class Database {
    constructor() {
        this.dbPath = process.env.DATABASE_PATH || './data/linkedin_automation.db';
        this.db = null;
    }

    async initialize() {
        // Ensure data directory exists
        const dataDir = path.dirname(this.dbPath);
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        return new Promise((resolve, reject) => {
            this.db = new sqlite3.Database(this.dbPath, (err) => {
                if (err) {
                    logger.error('Error opening database:', err);
                    reject(err);
                } else {
                    logger.info('Connected to SQLite database');
                    this.createTables().then(resolve).catch(reject);
                }
            });
        });
    }

    async createTables() {
        const tables = [
            // Jobs table
            `CREATE TABLE IF NOT EXISTS jobs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT UNIQUE NOT NULL,
                title TEXT NOT NULL,
                company TEXT NOT NULL,
                location TEXT,
                job_type TEXT,
                description TEXT,
                requirements TEXT,
                posted_date TEXT,
                scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                url TEXT,
                salary_range TEXT,
                experience_level TEXT,
                is_applied BOOLEAN DEFAULT FALSE,
                match_score REAL,
                keywords_matched TEXT
            )`,

            // Applications table
            `CREATE TABLE IF NOT EXISTS applications (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                job_id TEXT NOT NULL,
                application_id TEXT UNIQUE,
                status TEXT DEFAULT 'Applied',
                applied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_checked DATETIME DEFAULT CURRENT_TIMESTAMP,
                status_history TEXT,
                recruiter_contact TEXT,
                notes TEXT,
                FOREIGN KEY (job_id) REFERENCES jobs (job_id)
            )`,

            // Companies table
            `CREATE TABLE IF NOT EXISTS companies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                company_name TEXT UNIQUE NOT NULL,
                industry TEXT,
                size TEXT,
                location TEXT,
                website TEXT,
                description TEXT,
                scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                employees_count INTEGER,
                founded_year INTEGER,
                specialties TEXT
            )`,

            // Recruiters table
            `CREATE TABLE IF NOT EXISTS recruiters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                title TEXT,
                company TEXT,
                profile_url TEXT UNIQUE,
                email TEXT,
                phone TEXT,
                location TEXT,
                scraped_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                connection_degree INTEGER,
                mutual_connections INTEGER
            )`,

            // Search filters table
            `CREATE TABLE IF NOT EXISTS search_filters (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                keywords TEXT NOT NULL,
                locations TEXT,
                job_types TEXT,
                experience_levels TEXT,
                salary_min INTEGER,
                salary_max INTEGER,
                is_active BOOLEAN DEFAULT TRUE,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_used DATETIME
            )`,

            // Application settings table
            `CREATE TABLE IF NOT EXISTS application_settings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                setting_key TEXT UNIQUE NOT NULL,
                setting_value TEXT,
                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )`,

            // Scraping logs table
            `CREATE TABLE IF NOT EXISTS scraping_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL, -- 'job_scrape', 'application_check', 'company_scrape'
                status TEXT NOT NULL, -- 'success', 'error', 'partial'
                items_processed INTEGER DEFAULT 0,
                errors_count INTEGER DEFAULT 0,
                duration_ms INTEGER,
                started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                completed_at DATETIME,
                error_message TEXT
            )`
        ];

        for (const tableSQL of tables) {
            await this.run(tableSQL);
        }

        // Create indexes for better performance
        const indexes = [
            'CREATE INDEX IF NOT EXISTS idx_jobs_job_id ON jobs(job_id)',
            'CREATE INDEX IF NOT EXISTS idx_jobs_company ON jobs(company)',
            'CREATE INDEX IF NOT EXISTS idx_jobs_scraped_at ON jobs(scraped_at)',
            'CREATE INDEX IF NOT EXISTS idx_applications_job_id ON applications(job_id)',
            'CREATE INDEX IF NOT EXISTS idx_applications_status ON applications(status)',
            'CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(company_name)',
            'CREATE INDEX IF NOT EXISTS idx_recruiters_company ON recruiters(company)',
            'CREATE INDEX IF NOT EXISTS idx_scraping_logs_type ON scraping_logs(type)',
            'CREATE INDEX IF NOT EXISTS idx_scraping_logs_started_at ON scraping_logs(started_at)'
        ];

        for (const indexSQL of indexes) {
            await this.run(indexSQL);
        }

        logger.info('Database tables and indexes created successfully');
    }

    run(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            this.db.run(sql, params, function(err) {
                if (err) {
                    logger.error('Database run error:', err);
                    reject(err);
                } else {
                    resolve(this);
                }
            });
        });
    }

    get(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            this.db.get(sql, params, (err, row) => {
                if (err) {
                    logger.error('Database get error:', err);
                    reject(err);
                } else {
                    resolve(row);
                }
            });
        });
    }

    all(sql, params = []) {
        return new Promise((resolve, reject) => {
            if (!this.db) {
                reject(new Error('Database not initialized'));
                return;
            }
            
            this.db.all(sql, params, (err, rows) => {
                if (err) {
                    logger.error('Database all error:', err);
                    reject(err);
                } else {
                    resolve(rows);
                }
            });
        });
    }

    async insertJob(jobData) {
        const sql = `INSERT OR REPLACE INTO jobs 
            (job_id, title, company, location, job_type, description, requirements, 
             posted_date, url, salary_range, experience_level, match_score, keywords_matched)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        return this.run(sql, [
            jobData.jobId,
            jobData.title,
            jobData.company,
            jobData.location,
            jobData.jobType,
            jobData.description,
            jobData.requirements,
            jobData.postedDate,
            jobData.url,
            jobData.salaryRange,
            jobData.experienceLevel,
            jobData.matchScore,
            JSON.stringify(jobData.keywordsMatched || [])
        ]);
    }

    async insertApplication(applicationData) {
        const sql = `INSERT OR REPLACE INTO applications 
            (job_id, application_id, status, applied_at, recruiter_contact, notes)
            VALUES (?, ?, ?, ?, ?, ?)`;
        
        return this.run(sql, [
            applicationData.jobId,
            applicationData.applicationId,
            applicationData.status,
            applicationData.appliedAt,
            applicationData.recruiterContact,
            applicationData.notes
        ]);
    }

    async updateApplicationStatus(applicationId, status, statusHistory) {
        const sql = `UPDATE applications 
            SET status = ?, last_checked = CURRENT_TIMESTAMP, status_history = ?
            WHERE application_id = ?`;
        
        return this.run(sql, [status, JSON.stringify(statusHistory), applicationId]);
    }

    async insertCompany(companyData) {
        const sql = `INSERT OR REPLACE INTO companies 
            (company_name, industry, size, location, website, description, 
             employees_count, founded_year, specialties)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
        
        return this.run(sql, [
            companyData.name,
            companyData.industry,
            companyData.size,
            companyData.location,
            companyData.website,
            companyData.description,
            companyData.employeesCount,
            companyData.foundedYear,
            JSON.stringify(companyData.specialties || [])
        ]);
    }

    async getJobStats() {
        const stats = {};
        
        stats.totalJobs = (await this.get('SELECT COUNT(*) as count FROM jobs')).count;
        stats.appliedJobs = (await this.get('SELECT COUNT(*) as count FROM jobs WHERE is_applied = TRUE')).count;
        stats.todayJobs = (await this.get(`
            SELECT COUNT(*) as count FROM jobs 
            WHERE date(scraped_at) = date('now')
        `)).count;
        
        stats.applicationStats = await this.all(`
            SELECT status, COUNT(*) as count 
            FROM applications 
            GROUP BY status
        `);
        
        return stats;
    }

    async close() {
        if (this.db) {
            return new Promise((resolve) => {
                this.db.close((err) => {
                    if (err) {
                        logger.error('Error closing database:', err);
                    } else {
                        logger.info('Database connection closed');
                    }
                    resolve();
                });
            });
        }
    }
}

module.exports = Database;
