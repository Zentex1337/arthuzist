/**
 * Middleware Functions
 * Authentication, admin check, rate limiting, CORS
 */

const { verifyAccessToken, parseCookies } = require('./auth');
const { supabase } = require('./supabase');

/**
 * Generate unique request ID for tracking
 */
function generateRequestId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `REQ-${timestamp}${random}`.toUpperCase();
}

/**
 * CORS Middleware with Security Headers
 * Restricts to allowed origin only (no wildcards)
 */
function handleCors(req, res) {
    const allowedOrigin = process.env.ALLOWED_ORIGIN || 'http://localhost:3000';
    const origin = req.headers.origin;

    // Only allow specific origin
    if (origin === allowedOrigin || !origin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400');

    // Security Headers - prevent common attacks
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // Request ID for tracking
    const requestId = generateRequestId();
    res.setHeader('X-Request-ID', requestId);
    req.requestId = requestId; // Attach to request for logging

    // Prevent caching of sensitive data
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Handle preflight
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return true;
    }

    return false;
}

/**
 * Authentication Middleware
 * Extracts and verifies JWT from cookie or Authorization header
 */
async function requireAuth(req, res) {
    // Try cookie first, then Authorization header
    const cookies = parseCookies(req.headers.cookie);
    let token = cookies.access_token;

    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
    }

    if (!token) {
        res.status(401).json({ error: 'Authentication required' });
        return null;
    }

    const payload = verifyAccessToken(token);
    if (!payload) {
        res.status(401).json({ error: 'Invalid or expired token' });
        return null;
    }

    // Fetch fresh user data including admin_permissions
    const { data: user, error } = await supabase
        .from('users')
        .select('id, email, name, role, banned, admin_permissions')
        .eq('id', payload.sub)
        .single();

    if (error || !user) {
        res.status(401).json({ error: 'User not found' });
        return null;
    }

    if (user.banned) {
        res.status(403).json({ error: 'Account suspended' });
        return null;
    }

    return user;
}

/**
 * Optional Auth - Returns user if authenticated, null otherwise
 */
async function optionalAuth(req) {
    const cookies = parseCookies(req.headers.cookie);
    let token = cookies.access_token;

    if (!token) {
        const authHeader = req.headers.authorization;
        if (authHeader?.startsWith('Bearer ')) {
            token = authHeader.substring(7);
        }
    }

    if (!token) return null;

    const payload = verifyAccessToken(token);
    if (!payload) return null;

    const { data: user } = await supabase
        .from('users')
        .select('id, email, name, role, banned')
        .eq('id', payload.sub)
        .single();

    if (!user || user.banned) return null;

    return user;
}

/**
 * Super Admin emails from environment variable
 * Set SUPER_ADMIN_EMAILS in Vercel env vars (comma-separated)
 */
function getSuperAdmins() {
    const envAdmins = process.env.SUPER_ADMIN_EMAILS || '';
    return envAdmins.split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
}

/**
 * Check if user is super admin
 */
function isSuperAdmin(user) {
    if (!user || user.role !== 'admin') return false;
    const superAdmins = getSuperAdmins();
    return superAdmins.includes(user.email?.toLowerCase());
}

/**
 * Admin Check - Must be used after requireAuth
 */
function requireAdmin(user, res) {
    if (!user || user.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return false;
    }
    return true;
}

/**
 * Super Admin Check - Must be used after requireAuth
 */
function requireSuperAdmin(user, res) {
    if (!user || !isSuperAdmin(user)) {
        res.status(403).json({ error: 'Super admin access required' });
        return false;
    }
    return true;
}

/**
 * Check if admin has specific permission
 * Super admins have all permissions automatically
 * @param {object} user - User object from requireAuth
 * @param {string} permission - Permission to check (e.g., 'manage_orders', 'manage_tickets')
 */
function hasPermission(user, permission) {
    if (!user || user.role !== 'admin') return false;

    // Super admins have all permissions
    if (isSuperAdmin(user)) return true;

    // Check specific permission
    const perms = user.admin_permissions || {};
    return !!perms[permission];
}

/**
 * Require specific admin permission
 * @param {object} user - User object from requireAuth
 * @param {object} res - Response object
 * @param {string} permission - Permission to check
 */
function requirePermission(user, res, permission) {
    if (!user || user.role !== 'admin') {
        res.status(403).json({ error: 'Admin access required' });
        return false;
    }

    if (!hasPermission(user, permission)) {
        res.status(403).json({ error: `Permission denied: ${permission.replace('_', ' ')} access required` });
        return false;
    }

    return true;
}

/**
 * Rate Limiting
 * Database-backed for distributed rate limiting across serverless instances
 */
async function checkRateLimit(req, res, action, maxAttempts = 10, windowMs = 60000) {
    // No whitelisting - security best practice
    const identifier = getClientIP(req);
    const windowStart = new Date(Date.now() - windowMs);

    try {
        // Check current rate limit status
        const { data: limit } = await supabase
            .from('rate_limits')
            .select('*')
            .eq('identifier', identifier)
            .eq('action', action)
            .single();

        if (limit) {
            // Check if blocked
            if (limit.blocked_until && new Date(limit.blocked_until) > new Date()) {
                const retryAfter = Math.ceil((new Date(limit.blocked_until) - new Date()) / 1000);
                res.setHeader('Retry-After', retryAfter);
                res.status(429).json({
                    error: 'Too many requests',
                    retryAfter
                });
                return false;
            }

            // Check if within window
            if (new Date(limit.window_start) > windowStart) {
                if (limit.attempts >= maxAttempts) {
                    // Block for 5 minutes
                    const blockedUntil = new Date(Date.now() + 5 * 60 * 1000);
                    await supabase
                        .from('rate_limits')
                        .update({ blocked_until: blockedUntil.toISOString() })
                        .eq('id', limit.id);

                    res.status(429).json({
                        error: 'Too many requests',
                        retryAfter: 300
                    });
                    return false;
                }

                // Increment attempts
                await supabase
                    .from('rate_limits')
                    .update({ attempts: limit.attempts + 1 })
                    .eq('id', limit.id);
            } else {
                // Reset window
                await supabase
                    .from('rate_limits')
                    .update({
                        attempts: 1,
                        window_start: new Date().toISOString(),
                        blocked_until: null
                    })
                    .eq('id', limit.id);
            }
        } else {
            // Create new rate limit record
            await supabase
                .from('rate_limits')
                .insert({
                    identifier,
                    action,
                    attempts: 1,
                    window_start: new Date().toISOString()
                });
        }

        return true;
    } catch (error) {
        // On error, allow request but log
        console.error('Rate limit check failed:', error);
        return true;
    }
}

/**
 * Get client IP address
 */
function getClientIP(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim()
        || req.headers['x-real-ip']
        || req.socket?.remoteAddress
        || 'unknown';
}

/**
 * Get client user agent
 */
function getUserAgent(req) {
    return (req.headers['user-agent'] || '').substring(0, 500);
}

/**
 * Verify hCaptcha token
 */
async function verifyHCaptcha(token, res) {
    if (!token) {
        res.status(400).json({ error: 'Captcha verification required' });
        return false;
    }

    const secretKey = process.env.HCAPTCHA_SECRET_KEY;
    if (!secretKey) {
        console.error('HCAPTCHA_SECRET_KEY not configured');
        // In development, allow without captcha if not configured
        if (process.env.NODE_ENV === 'development') {
            return true;
        }
        res.status(500).json({ error: 'Captcha not configured' });
        return false;
    }

    try {
        const response = await fetch('https://hcaptcha.com/siteverify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: `response=${encodeURIComponent(token)}&secret=${encodeURIComponent(secretKey)}`
        });

        const data = await response.json();

        if (!data.success) {
            console.error('hCaptcha verification failed:', data['error-codes']);
            res.status(400).json({ error: 'Captcha verification failed' });
            return false;
        }

        return true;
    } catch (error) {
        console.error('hCaptcha verification error:', error);
        res.status(500).json({ error: 'Captcha verification failed' });
        return false;
    }
}

module.exports = {
    handleCors,
    requireAuth,
    optionalAuth,
    requireAdmin,
    requireSuperAdmin,
    isSuperAdmin,
    hasPermission,
    requirePermission,
    checkRateLimit,
    getClientIP,
    getUserAgent,
    verifyHCaptcha,
    generateRequestId
};
