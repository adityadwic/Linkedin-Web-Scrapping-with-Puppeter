# LinkedIn Automation Tool - Sample Configuration

## Before You Start

1. **Copy .env.example to .env**
   ```bash
   cp .env.example .env
   ```

2. **Edit .env file with your credentials**
   - Add your LinkedIn email and password
   - Configure job search parameters
   - Set application preferences

3. **Add your resume**
   - Place your resume as `data/cv.pdf`
   - Ensure it's a clean, professional PDF

4. **Customize cover letter**
   - Edit `data/cover_letter_template.txt`
   - Use placeholders: {company}, {position}, {location}, {date}

## Sample Data Files

This directory contains:
- `cover_letter_template.txt` - Cover letter template with placeholders
- `cv.pdf` - Your resume (add your own file)
- `linkedin_automation.db` - SQLite database (auto-created)

## Important Notes

- **Test thoroughly** before enabling auto-apply
- **Start with manual mode** to understand the tool
- **Review all scraped data** for accuracy
- **Monitor LinkedIn for any issues**

## Safety First

- Set `AUTO_APPLY_ENABLED=false` initially
- Use `MAX_APPLICATIONS_PER_DAY=5` or lower
- Enable `HEADLESS_MODE=false` for debugging
- Check logs regularly in `logs/` directory
