# 🔐 SSL Certificate Issues - Production Fixes

## Root Cause Analysis
The SSL certificate errors you're seeing are typically caused by:

1. **Outdated Certificate Store**: System certificate authorities are outdated
2. **Network Configuration**: Corporate firewalls or proxies intercepting SSL
3. **System Time**: Incorrect system date/time causing certificate validation failures
4. **Missing Intermediate Certificates**: Some sites don't provide complete certificate chains

## 🛠️ Production-Ready Solutions

### 1. Update System Certificate Store

#### macOS:
```bash
# Update system certificates
sudo /usr/bin/security update-ca-certificates

# Update Homebrew certificates (if using Homebrew)
brew update && brew upgrade ca-certificates

# Force update system time
sudo sntp -sS time.apple.com
```

#### Linux:
```bash
# Ubuntu/Debian
sudo apt-get update && sudo apt-get upgrade ca-certificates

# CentOS/RHEL
sudo yum update ca-certificates

# Arch Linux
sudo pacman -Syu ca-certificates
```

### 2. Check System Time
```bash
# Verify system time is correct
date

# Sync with time server if needed (macOS)
sudo sntp -sS time.apple.com

# Linux
sudo ntpdate -s time.nist.gov
```

### 3. Network Diagnostics
```bash
# Test SSL connection to a specific site
openssl s_client -connect google.com:443 -servername google.com

# Check certificate chain
openssl s_client -connect google.com:443 -showcerts

# Verify DNS resolution
nslookup google.com
```

### 4. Corporate Network Solutions

If you're behind a corporate firewall:

```typescript
// Add to main.ts for corporate environments
app.on('ready', () => {
  // Set up proxy if needed
  session.defaultSession.setProxy({
    proxyRules: 'http://your-proxy:8080',
    proxyBypassRules: 'localhost,127.0.0.1'
  });
  
  // Add corporate certificates
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    // Implement custom certificate validation for corporate certs
    const { hostname, certificate, verificationResult, errorCode } = request;
    
    // Log for debugging
    console.log('Certificate verification for:', hostname);
    
    // Allow corporate domains with custom certificates
    const corporateDomains = ['internal.company.com', 'corporate-proxy.com'];
    if (corporateDomains.some(domain => hostname.includes(domain))) {
      callback(0); // Accept certificate
    } else {
      callback(verificationResult); // Use system verification
    }
  });
});
```

### 5. Electron-Specific Fixes

```typescript
// In main.ts - Add proper certificate handling
import { app, session } from 'electron';

app.whenReady().then(() => {
  // Configure session for better certificate handling
  session.defaultSession.webRequest.onBeforeRequest((details, callback) => {
    // Log problematic requests
    console.log('Request to:', details.url);
    callback({});
  });
  
  // Handle certificate errors with detailed logging
  session.defaultSession.setCertificateVerifyProc((request, callback) => {
    const { hostname, certificate, verificationResult, errorCode } = request;
    
    console.log('Certificate verification:', {
      hostname,
      verificationResult,
      errorCode,
      issuer: certificate.issuer,
      subject: certificate.subject
    });
    
    // Use system certificate verification
    callback(verificationResult);
  });
});
```

### 6. Environment Variables

```bash
# Set certificate bundle path if needed
export SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt
export SSL_CERT_DIR=/etc/ssl/certs

# For Node.js applications
export NODE_EXTRA_CA_CERTS=/path/to/extra/certificates.pem
```

### 7. Application-Level Certificate Bundle

```typescript
// Add to your Electron app
import * as https from 'https';
import * as fs from 'fs';

// Load additional certificates if needed
const extraCerts = fs.readFileSync('/path/to/corporate-certs.pem');
https.globalAgent.options.ca = https.globalAgent.options.ca || [];
https.globalAgent.options.ca.push(extraCerts);
```

## 🚨 What NOT to Do in Production

```typescript
// ❌ NEVER do this in production:
app.commandLine.appendSwitch('ignore-certificate-errors');
app.commandLine.appendSwitch('ignore-ssl-errors');
webview.setAttribute('disablewebsecurity', 'true');
```

## 🔍 Debugging Steps

1. **Check specific failing URLs**:
```bash
curl -v https://failing-site.com
```

2. **Test with different DNS**:
```bash
# Use Google DNS
dig @8.8.8.8 failing-site.com
```

3. **Verify certificate chain**:
```bash
openssl s_client -connect failing-site.com:443 -verify_return_error
```

4. **Check system certificate store**:
```bash
# macOS
security find-certificate -a -p /System/Library/Keychains/SystemRootCertificates.keychain

# Linux
ls /etc/ssl/certs/
```

## 🎯 Expected Results

After applying these fixes:
- ✅ SSL connections work properly
- ✅ Certificate errors are resolved
- ✅ Security is maintained
- ✅ Corporate networks are supported
- ✅ No browser security warnings

## 🆘 If Problems Persist

1. **Check Electron version**: Ensure you're using a recent version
2. **Test in different network**: Rule out network-specific issues
3. **Contact IT department**: For corporate network configurations
4. **File bug report**: If it's an Electron-specific issue

The key is to fix the root cause rather than bypassing security! 🛡️ 