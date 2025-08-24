# LinkedIn Automation Tool

A comprehensive Puppeteer-based automation tool for LinkedIn that provides job scraping, application tracking, company research, and automated job applications with advanced anti-detection mechanisms.

## 🚀 Features

### Core Functionality
- **🔍 Job Scraping**: Automatically scrape new job postings from LinkedIn with customizable filters
- **📊 Application Tracking**: Monitor the status of your submitted applications in real-time
- **🏢 Company Research**: Scrape detailed company information and recruiter profiles
- **🤖 Auto-Application**: Automatically apply to jobs matching your criteria (Easy Apply only)

### Advanced Features
- **🕰️ Scheduled Operations**: Run scraping and tracking tasks on autopilot
- **🌐 Web Dashboard**: Monitor everything through an intuitive web interface
- **🛡️ Anti-Detection**: Advanced browser fingerprinting and proxy support
- **📈 Analytics**: Detailed statistics and success metrics
- **⚙️ Configurable**: Extensive customization options
- **🔄 Fresh Start Mode**: Clear browser history and cookies for clean sessions
- **🔧 Manual Controls**: Trigger scraping operations on-demand via dashboard
- **📝 Comprehensive Logging**: Detailed activity logs and error tracking

## 📋 Prerequisites

- **Node.js** 18.0 or higher
- **npm** or **yarn**
- **LinkedIn Account** with valid credentials
- **Google Chrome** or **Chromium** (for Puppeteer)
- **macOS/Linux/Windows** (tested on macOS)

## 🛠️ Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd linkedin-automation-tool
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```

4. **Edit the `.env` file with your configuration**
   ```env
   # LinkedIn Credentials
   LINKEDIN_EMAIL=your_email@example.com
   LINKEDIN_PASSWORD=your_password_here
   
   # Job Search Settings
   JOB_SEARCH_KEYWORDS=software engineer,full stack,backend
   JOB_LOCATIONS=United States,Remote
   JOB_TYPES=Full-time,Contract
   
   # Auto Application (CAUTION: Use at your own risk)
   AUTO_APPLY_ENABLED=false
   MAX_APPLICATIONS_PER_DAY=5
   ```

5. **Create necessary directories**
   ```bash
   mkdir -p data logs screenshots
   ```

## 🎯 Quick Start

### 1. Start the Main Application
```bash
npm start
```

**Access Points:**
- Dashboard: `http://localhost:3001/dashboard` (default port changed to avoid conflicts)
- API Health Check: `http://localhost:3001/api/health`
- API Documentation: `http://localhost:3001/api-docs`

### 2. System Verification
```bash
npm test
```
This runs a comprehensive system test to verify all components are working correctly.

### 3. Manual Operations via Dashboard

**Fresh Start Scraping** (Recommended for first use):
- Navigate to dashboard
- Click "🔍 Scrape Jobs" for immediate job scraping
- Click "📊 Track Applications" for application status updates  
- Click "🏢 Scrape Companies" for company research

### 4. Run Individual Scripts

**Scrape Jobs**
```bash
npm run scrape-jobs
```

**Track Applications**
```bash
npm run track-applications
```

**Scrape Companies**
```bash
npm run scrape-companies
```

**Test Browser Setup**
```bash
node test-browser.js
```

## 📖 Usage Guide

### Web Dashboard
The web dashboard provides a comprehensive overview of your automation activities:

- **📊 Overview**: Total jobs, applications, and response rates
- **🔄 Recent Activity**: Latest scraping and application activities  
- **📈 Analytics**: Status distributions and success metrics
- **⚡ Quick Actions**: Manual triggers for immediate operations
- **🔧 System Status**: Real-time health monitoring

### Fresh Start Mode
For clean sessions without cached login data:
- Set `FRESH_START=true` in `.env` file
- Use manual dashboard triggers for one-time fresh scraping
- Automatically clears browser history and cookies before operations

### Email Verification Handling
When LinkedIn requests email verification:
1. **Non-headless mode**: Browser window will appear showing verification page
2. **Check your email** for LinkedIn verification code
3. **Enter code** in the browser window
4. **Press Enter** in terminal to continue automation
5. System will automatically proceed after verification

### Job Scraping
The tool automatically searches for jobs based on your configured filters:

```javascript
// Example custom filters
const filters = {
    keywords: ['software engineer', 'developer'],
    locations: ['San Francisco', 'Remote'],
    jobTypes: ['Full-time'],
    maxJobs: 50,
    minMatchScore: 60
};
```

### Application Tracking
Monitor your application status changes:

- **Applied** → **Viewed** → **Shortlisted** → **Interview** → **Hired/Rejected**
- Automatic status history tracking
- Recruiter contact information extraction

### Company Research
Gather comprehensive company data:

- Company size, industry, and location
- Employee count and founding year
- Recruiter profiles and contact information
- Company specialties and descriptions

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `LINKEDIN_EMAIL` | Your LinkedIn email | Required |
| `LINKEDIN_PASSWORD` | Your LinkedIn password | Required |
| `PORT` | Server port | 3001 |
| `SCRAPE_INTERVAL_MINUTES` | Job scraping frequency | 10 |
| `MAX_JOBS_PER_SCRAPE` | Maximum jobs per scrape | 50 |
| `AUTO_APPLY_ENABLED` | Enable auto-application | false |
| `MAX_APPLICATIONS_PER_DAY` | Daily application limit | 20 |
| `HEADLESS_MODE` | Run browser in headless mode | false |
| `BROWSER_TIMEOUT` | Browser operation timeout | 30000 |
| `NAVIGATION_TIMEOUT` | Page navigation timeout | 30000 |
| `USE_PROXY` | Enable proxy rotation | false |
| `FRESH_START` | Clear browser data on start | false |
| `LOG_LEVEL` | Logging verbosity | info |

### Search Filters
Create and manage search filters through the API or dashboard:

```javascript
{
  "name": "Senior Developer Jobs",
  "keywords": ["senior developer", "tech lead"],
  "locations": ["Remote", "San Francisco"],
  "jobTypes": ["Full-time"],
  "experienceLevels": ["Mid-Senior level"],
  "salaryMin": 120000,
  "isActive": true
}
```

## 🔒 Security & Privacy

### Anti-Detection Measures
- **Browser Fingerprinting**: Randomized user agents and browser properties
- **Human-like Behavior**: Realistic delays, mouse movements, and scrolling
- **Proxy Support**: Rotate through multiple proxy servers
- **Session Management**: Persistent cookies and session storage

### Data Protection
- All data stored locally in SQLite database
- No data transmitted to external services
- Secure credential management
- Optional data encryption

## 📊 API Reference

### Manual Trigger APIs
```bash
POST /api/jobs/scrape             # Trigger manual job scraping
POST /api/applications/track      # Trigger manual application tracking  
POST /api/companies/scrape        # Trigger manual company scraping
```

### Jobs API
```bash
GET /api/jobs                    # Get all jobs with filters
GET /api/jobs/:id               # Get specific job
GET /api/jobs/stats/overview    # Get job statistics
PATCH /api/jobs/:id/apply       # Mark job as applied
DELETE /api/jobs/:id            # Delete job
```

### Applications API
```bash
GET /api/applications           # Get all applications
GET /api/applications/:id       # Get specific application
PATCH /api/applications/:id/status # Update application status
POST /api/applications          # Create manual application
```

### Companies API
```bash
GET /api/companies              # Get all companies
GET /api/companies/:name        # Get specific company
GET /api/companies/:name/jobs   # Get jobs for company
POST /api/companies             # Add company manually
```

### Dashboard API
```bash
GET /api/dashboard/overview     # Get dashboard overview
GET /api/dashboard/stats        # Get system statistics
GET /api/dashboard/recent-activity # Get recent activity
GET /api/dashboard/scraping-logs # Get scraping logs
GET /api/health                 # System health check
```

## 🚨 Important Disclaimers

### Legal Compliance
- **Review LinkedIn's Terms of Service** before using this tool
- **Respect rate limits** and avoid aggressive scraping
- **Use responsibly** and ethically
- **Test thoroughly** in a controlled environment first

### Auto-Application Risks
- **Disabled by default** for safety
- **Use with extreme caution** - may violate LinkedIn ToS
- **Review all applications** before enabling
- **Set conservative daily limits**
- **Monitor application quality**

### Data Accuracy
- Scraped data may be incomplete or outdated
- Application status changes may have delays
- Always verify critical information manually

## 🛠️ Development

### Project Structure
```
src/
├── index.js                 # Main application entry
├── services/               # Core business logic
│   ├── linkedinAuth.js     # Authentication service
│   ├── jobScraper.js       # Job scraping service
│   ├── applicationTracker.js # Application tracking
│   ├── companyScraper.js   # Company research
│   ├── autoApplicant.js    # Auto-application service
│   └── scheduler.js        # Task scheduling
├── utils/                  # Utility modules
│   ├── browserManager.js   # Browser automation
│   ├── database.js         # Database operations
│   └── logger.js           # Logging service
├── routes/                 # API routes
└── scripts/                # Standalone scripts
```

### Adding Custom Features

1. **Create new service**
   ```javascript
   class CustomService {
     constructor(database) {
       this.database = database;
     }
     
     async performTask() {
       // Your custom logic
     }
   }
   ```

2. **Add API routes**
   ```javascript
   router.get('/custom-endpoint', async (req, res) => {
     // Handle request
   });
   ```

3. **Update scheduler**
   ```javascript
   this.scheduleCustomTask(60); // Run every 60 minutes
   ```

## 🐛 Troubleshooting

### Common Issues

**Port Already in Use**
```bash
# If port 3001 is already in use, change in .env file:
PORT=3002
```

**Authentication Failures**
- Verify LinkedIn credentials in `.env` file
- Check for 2FA requirements or email verification
- Ensure account is not locked
- Try with `HEADLESS_MODE=false` to see browser interactions

**Browser Not Appearing (macOS)**
- Set `HEADLESS_MODE=false` in `.env`
- Check Activity Monitor for Chrome/Chromium processes
- Try running `node test-browser.js` to verify browser setup
- Ensure Chrome is installed and accessible

**Scraping Errors**
- LinkedIn may have changed their HTML structure
- Check for CAPTCHA or email verification challenges
- Verify network connectivity
- Try with fresh start mode: `FRESH_START=true`

**Email Verification Required**
- Check your email for LinkedIn verification code
- Enter code in browser window (non-headless mode)
- Press Enter in terminal to continue
- Use `HEADLESS_MODE=false` for manual handling

**Application Tracking Issues**
- Applications page layout may have changed
- Status text patterns might be outdated
- Manual verification recommended

**Database Issues**
```bash
# Clear database if corrupted
rm -rf data/linkedin_automation.db
# Restart application to recreate tables
npm start
```

### Debug Mode
```bash
LOG_LEVEL=debug npm start
```

### System Health Check
```bash
curl http://localhost:3001/api/health
```

### Testing Browser Setup
```bash
node test-browser.js
```

### Getting Help
1. Check the logs in `logs/combined.log`
2. Enable debug mode for verbose output
3. Take screenshots during errors (saved in `screenshots/`)
4. Review browser console for JavaScript errors
5. Run system test: `npm test`

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## ⚠️ Final Warning

This tool automates interactions with LinkedIn, which may violate their Terms of Service. Use at your own risk and responsibility. The developers are not liable for any consequences resulting from the use of this software.

**Always:**
- Test in a development environment first
- Use conservative settings
- Monitor for LinkedIn policy changes
- Respect other users and companies
- Follow ethical scraping practices

---

**Happy job hunting! 🎯**

## 🎉 Recent Updates

### Version 2.0 Features
- ✅ **Enhanced Browser Management**: Improved stability and error recovery
- ✅ **Fresh Start Mode**: Clean browser sessions on demand
- ✅ **Email Verification Handling**: Automatic detection and user guidance
- ✅ **Manual Dashboard Controls**: On-demand scraping triggers
- ✅ **Comprehensive Testing**: System verification and health checks
- ✅ **Improved Navigation Flow**: Better LinkedIn page handling
- ✅ **Enhanced Error Logging**: Detailed debugging information
- ✅ **Port Configuration**: Customizable server port settings
- ✅ **API Enhancements**: New endpoints for manual operations

### Known Limitations
- LinkedIn's anti-bot detection may require manual intervention
- Email verification may be required for new accounts or suspicious activity
- Application success rates vary based on job posting complexity
- Headless mode may not work optimally on all systems

### Roadmap
- [ ] **Advanced AI Integration**: GPT-based application personalization
- [ ] **Mobile App Support**: React Native companion app
- [ ] **Cloud Deployment**: Docker containers and cloud hosting
- [ ] **Multi-Account Support**: Manage multiple LinkedIn accounts
- [ ] **Advanced Analytics**: Machine learning insights and predictions
