# 🚀 Panduan Urutan Menjalankan LinkedIn Automation Tool

## 📋 **LANGKAH 1: Persiapan Awal**

### **1.1 Cek Prerequisites**
```bash
# Cek versi Node.js (harus 18+)
node --version

# Cek versi npm
npm --version

# Cek apakah Chrome sudah terinstall
google-chrome --version
# atau
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --version
```

### **1.2 Pastikan Dependencies Terinstall**
```bash
cd /Users/adityadwicahyono/Desktop/Skilltest

# Install semua dependencies (jika belum)
npm install
```

---

## 📋 **LANGKAH 2: Konfigurasi**

### **2.1 Setup Environment Variables**
```bash
# Pastikan file .env sudah ada
ls -la .env

# Jika belum ada, copy dari template
cp .env.example .env
```

### **2.2 Isi Konfigurasi LinkedIn**
Edit file `.env` dengan credentials LinkedIn Anda:
```env
# LinkedIn Credentials (WAJIB DIISI)
LINKEDIN_EMAIL=your_email@linkedin.com
LINKEDIN_PASSWORD=your_secure_password

# Job Search Settings
JOB_KEYWORDS=software engineer,full stack,react
JOB_LOCATION=Jakarta,Remote,Indonesia
MAX_APPLICATIONS_PER_DAY=10

# Browser Settings
HEADLESS_MODE=true
STEALTH_MODE=true
```

### **2.3 Jalankan Setup Wizard (Recommended)**
```bash
npm run setup
```
Ikuti instruksi interaktif untuk konfigurasi lengkap.

---

## 📋 **LANGKAH 3: Test System**

### **3.1 Verifikasi System Health**
```bash
# Test apakah semua komponen berfungsi
npm test
```

### **3.2 Test Individual Components (Optional)**
```bash
# Test browser automation
node -e "const puppeteer = require('puppeteer'); puppeteer.launch().then(browser => { console.log('Browser OK'); browser.close(); });"

# Test database connection
sqlite3 data/linkedin_automation.db ".tables"
```

---

## 📋 **LANGKAH 4: Menjalankan Aplikasi**

### **4.1 Start Main Application**
```bash
# Jalankan aplikasi utama
npm start
```

**Output yang diharapkan:**
```
✅ Server running at http://localhost:3000
📊 Dashboard: http://localhost:3000/dashboard
📋 API Documentation: http://localhost:3000/api-docs
```

### **4.2 Akses Web Dashboard**
Buka browser dan kunjungi:
- **Dashboard**: http://localhost:3000/dashboard
- **API Docs**: http://localhost:3000/api-docs

---

## 📋 **LANGKAH 5: Operasi Normal**

### **5.1 Urutan Eksekusi yang Recommended**

#### **A. Manual Job Scraping (Pertama Kali)**
```bash
# Buka terminal baru (biarkan npm start tetap jalan)
# Scrape jobs manual untuk testing
npm run scrape-jobs
```

#### **B. Track Applications (Jika Ada)**
```bash
# Monitor aplikasi yang sudah pernah disubmit
npm run track-applications
```

#### **C. Company Research (Optional)**
```bash
# Research company information
npm run scrape-companies
```

#### **D. Auto Apply (HATI-HATI)**
```bash
# ⚠️ PERINGATAN: Test dulu dengan dry-run
# Auto apply ke jobs yang matching
npm run auto-apply
```

### **5.2 Monitoring Realtime**

#### **Dashboard Monitoring**
- Akses: http://localhost:3000/dashboard
- Monitor metrics: job discovery, applications, errors

#### **Log Monitoring**
```bash
# Monitor logs real-time
tail -f logs/combined.log

# Monitor error logs saja
tail -f logs/error.log
```

---

## 📋 **LANGKAH 6: Operational Schedule**

### **6.1 Automatic Scheduling (Default)**
Ketika `npm start` berjalan, sistem akan otomatis:
- **Setiap 10 menit**: Job scraping
- **Setiap 30 menit**: Application tracking
- **Setiap 2 jam**: Company research
- **Setiap hari jam 2 pagi**: Maintenance tasks

### **6.2 Manual Operations**
```bash
# Manual scraping kapan saja
npm run scrape-jobs

# Manual application tracking
npm run track-applications

# Manual auto-apply (hati-hati)
npm run auto-apply
```

---

## 📋 **URUTAN LENGKAP UNTUK PEMULA**

### **🎯 Quick Start (5 Menit)**
```bash
# 1. Masuk ke direktori
cd /Users/adityadwicahyono/Desktop/Skilltest

# 2. Setup credentials (ikuti wizard)
npm run setup

# 3. Test system
npm test

# 4. Start aplikasi
npm start

# 5. Buka dashboard (browser baru)
open http://localhost:3000/dashboard
```

### **🎯 First Run (10 Menit)**
```bash
# Terminal 1: Main application
npm start

# Terminal 2: Manual operations
npm run scrape-jobs      # Scrape 10-50 jobs
npm run track-applications  # Check existing apps
npm run scrape-companies    # Research companies

# Monitor di dashboard
open http://localhost:3000/dashboard
```

### **🎯 Daily Operations**
```bash
# Pagi: Start aplikasi
npm start

# Siang: Check dashboard & logs
tail -f logs/combined.log

# Sore: Manual scraping jika perlu
npm run scrape-jobs

# Malam: Stop aplikasi (Ctrl+C)
```

---

## 📋 **TROUBLESHOOTING COMMON ISSUES**

### **Issue: npm start gagal**
```bash
# Cek port 3000 sudah dipakai
lsof -ti:3000 | xargs kill -9

# Restart
npm start
```

### **Issue: LinkedIn login gagal**
```bash
# Cek credentials di .env
cat .env | grep LINKEDIN

# Test login manual di browser
# Update password jika perlu
```

### **Issue: Browser crash**
```bash
# Increase memory
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

### **Issue: No jobs found**
```bash
# Update search keywords di .env
# Check LinkedIn manually dengan keywords yang sama
```

---

## 📋 **SAFETY CHECKLIST**

### **✅ Sebelum Start:**
- [ ] Credentials LinkedIn sudah benar
- [ ] Keywords job search sudah sesuai
- [ ] MAX_APPLICATIONS_PER_DAY tidak lebih dari 10
- [ ] HEADLESS_MODE=true (untuk production)
- [ ] Backup data jika ada

### **✅ Saat Running:**
- [ ] Monitor dashboard setiap 1-2 jam
- [ ] Check logs untuk errors
- [ ] Pastikan tidak ada CAPTCHA challenges
- [ ] Monitor LinkedIn account untuk suspicious activity

### **✅ Safety Limits:**
- [ ] Max 10 applications per day
- [ ] Max 50 jobs scraped per session
- [ ] Delay minimal 3-5 detik antar aksi
- [ ] Stop jika ada error rate >20%

---

## 📋 **COMMANDS REFERENCE**

### **Main Commands:**
```bash
npm start                    # Start main application
npm run setup               # Interactive configuration
npm test                    # System verification
npm run scrape-jobs         # Manual job scraping
npm run track-applications  # Manual app tracking
npm run scrape-companies    # Manual company research
npm run auto-apply          # Manual auto-application
```

### **Monitoring Commands:**
```bash
tail -f logs/combined.log   # Monitor all logs
tail -f logs/error.log      # Monitor errors only
ps aux | grep node          # Check running processes
lsof -ti:3000              # Check port usage
```

### **Maintenance Commands:**
```bash
sqlite3 data/linkedin_automation.db "SELECT COUNT(*) FROM jobs;"
npm audit fix               # Update security vulnerabilities
npm outdated               # Check for package updates
```

---

**🚀 Sekarang Anda siap menjalankan LinkedIn automation tool dengan aman dan efektif!**

**💡 Tips:**
1. **Mulai dengan HEADLESS_MODE=false** untuk melihat browser action
2. **Set AUTO_APPLY_ENABLED=false** sampai Anda yakin system bekerja dengan baik
3. **Monitor dashboard secara berkala** untuk memastikan performance
4. **Backup database** sebelum operasi besar
5. **Respect LinkedIn's ToS** dan gunakan dengan bijak
