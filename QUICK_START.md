# ⚡ Quick Start Guide - LinkedIn Automation Tool

## 🚀 **URUTAN CEPAT (5 Menit)**

```bash
# 1. Masuk ke direktori
cd /Users/adityadwicahyono/Desktop/Skilltest

# 2. Setup (ikuti wizard)
npm run setup

# 3. Test system
npm test

# 4. Start aplikasi
npm start
```

**Buka dashboard:** http://localhost:3000/dashboard

---

## 📋 **URUTAN DETAIL STEP-BY-STEP**

### **STEP 1: Persiapan**
```bash
# Cek Node.js version (harus 18+)
node --version

# Install dependencies (jika belum)
npm install
```

### **STEP 2: Konfigurasi**
```bash
# Setup interaktif (recommended)
npm run setup

# Akan menanyakan:
# - LinkedIn Email: your_email@linkedin.com  
# - LinkedIn Password: your_password
# - Job Keywords: software engineer, react, node.js
# - Location: Jakarta, Indonesia, Remote
# - Max applications per day: 10
```

### **STEP 3: Test System**
```bash
# Verifikasi semua komponen
npm test

# Output yang diharapkan:
# ✅ Server Startup: PASS
# ✅ Database Connection: PASS  
# ✅ Web Dashboard: PASS
# ✅ Core Services: PASS
```

### **STEP 4: Start Main App**
```bash
# Terminal 1: Main application
npm start

# Output:
# 🚀 Server running at http://localhost:3000
# 📊 Dashboard: http://localhost:3000/dashboard
```

### **STEP 5: Operasi Manual (Terminal Baru)**
```bash
# Terminal 2: Manual operations

# A. Scrape jobs (testing)
npm run scrape-jobs

# B. Track applications (jika ada)
npm run track-applications

# C. Company research (optional)
npm run scrape-companies

# D. Auto apply (HATI-HATI!)
npm run auto-apply
```

### **STEP 6: Monitoring**
```bash
# Monitor dashboard
open http://localhost:3000/dashboard

# Monitor logs
tail -f logs/combined.log
```

---

## ⚠️ **SAFETY CHECKLIST**

### **✅ Sebelum Start:**
- [ ] LinkedIn credentials benar
- [ ] Max applications ≤ 10 per day
- [ ] Keywords job sesuai target
- [ ] HEADLESS_MODE=true (production)

### **✅ Saat Running:**
- [ ] Monitor dashboard tiap 1-2 jam
- [ ] Check logs untuk errors
- [ ] Watch for CAPTCHA challenges
- [ ] Stop jika error rate >20%

---

## 🔧 **TROUBLESHOOTING CEPAT**

### **Port 3000 sudah dipakai:**
```bash
lsof -ti:3000 | xargs kill -9
npm start
```

### **LinkedIn login gagal:**
```bash
# Check credentials
cat .env | grep LINKEDIN
# Update password di .env jika perlu
```

### **Browser crash:**
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
npm start
```

### **No jobs found:**
```bash
# Update keywords di .env
# Test manual di LinkedIn dengan keywords yang sama
```

---

## 📱 **MONITORING URLs**

- **Dashboard**: http://localhost:3000/dashboard
- **API Health**: http://localhost:3000/api/health  
- **API Docs**: http://localhost:3000/api-docs

---

## 🎯 **DAILY WORKFLOW**

### **Pagi (Start):**
```bash
npm start
open http://localhost:3000/dashboard
```

### **Siang (Monitor):**
```bash
# Check dashboard metrics
# Review logs for errors
tail -f logs/combined.log
```

### **Sore (Manual ops jika perlu):**
```bash
npm run scrape-jobs
npm run track-applications
```

### **Malam (Stop):**
```bash
# Ctrl+C untuk stop npm start
```

---

## 📊 **SUCCESS INDICATORS**

### **✅ System Healthy:**
- Dashboard accessible
- Jobs being scraped (>10 per session)
- No error messages in logs
- Applications tracked successfully
- Response time <30 seconds

### **⚠️ Needs Attention:**
- Error rate >15%
- No jobs found for >1 hour
- LinkedIn login challenges
- Memory usage >2GB
- Timeout errors

### **🚨 Stop Immediately:**
- CAPTCHA challenges
- Account suspension warnings
- Error rate >30%
- Memory usage >4GB
- Continuous crashes

---

**💡 REMEMBER:**
1. **Start small** - test with limited keywords first
2. **Monitor closely** - especially first few runs  
3. **Respect limits** - max 10 applications per day
4. **Keep updated** - check for LinkedIn policy changes
5. **Use ethically** - respect other users and companies

**🚀 Happy job hunting!**
