/**
 * Authentication Utilities
 * bcrypt password hashing + JWT token management
 */

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

const BCRYPT_COST = 12;
const ACCESS_TOKEN_EXPIRY = '1h';  // Extended to 1 hour
const REFRESH_TOKEN_EXPIRY = '30d'; // Extended to 30 days for auto-login

/**
 * Hash password with bcrypt (cost factor 12)
 */
async function hashPassword(password) {
    return bcrypt.hash(password, BCRYPT_COST);
}

/**
 * Verify password against hash
 */
async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

/**
 * Generate access token (short-lived, 15 minutes)
 */
function generateAccessToken(user) {
    if (!process.env.JWT_SECRET) {
        throw new Error('JWT_SECRET not configured');
    }

    const payload = {
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'access'
    };

    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_EXPIRY,
        issuer: 'arthuzist',
        audience: 'arthuzist-api'
    });
}

/**
 * Generate refresh token (long-lived, 7 days)
 */
function generateRefreshToken(user) {
    if (!process.env.JWT_REFRESH_SECRET) {
        throw new Error('JWT_REFRESH_SECRET not configured');
    }

    const payload = {
        sub: user.id,
        type: 'refresh',
        jti: crypto.randomUUID()
    };

    return jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: REFRESH_TOKEN_EXPIRY,
        issuer: 'arthuzist'
    });
}

/**
 * Verify access token
 */
function verifyAccessToken(token) {
    try {
        return jwt.verify(token, process.env.JWT_SECRET, {
            issuer: 'arthuzist',
            audience: 'arthuzist-api'
        });
    } catch (error) {
        return null;
    }
}

/**
 * Verify refresh token
 */
function verifyRefreshToken(token) {
    try {
        return jwt.verify(token, process.env.JWT_REFRESH_SECRET, {
            issuer: 'arthuzist'
        });
    } catch (error) {
        return null;
    }
}

/**
 * Hash token for secure storage (prevents token theft from DB)
 */
function hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate random token
 */
function generateRandomToken(length = 32) {
    return crypto.randomBytes(length).toString('hex');
}

/**
 * Parse cookies from request
 */
function parseCookies(cookieHeader) {
    const cookies = {};
    if (!cookieHeader) return cookies;

    cookieHeader.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.split('=');
        if (name && rest.length) {
            cookies[name.trim()] = rest.join('=').trim();
        }
    });

    return cookies;
}

/**
 * Create cookie header string
 */
function createCookieHeader(name, value, options = {}) {
    const {
        httpOnly = true,
        secure = process.env.NODE_ENV === 'production',
        sameSite = 'Lax',
        maxAge,
        path = '/'
    } = options;

    let cookie = `${name}=${value}; Path=${path}`;

    if (httpOnly) cookie += '; HttpOnly';
    if (secure) cookie += '; Secure';
    if (sameSite) cookie += `; SameSite=${sameSite}`;
    if (maxAge) cookie += `; Max-Age=${maxAge}`;

    return cookie;
}

module.exports = {
    hashPassword,
    verifyPassword,
    generateAccessToken,
    generateRefreshToken,
    verifyAccessToken,
    verifyRefreshToken,
    hashToken,
    generateRandomToken,
    parseCookies,
    createCookieHeader,
    ACCESS_TOKEN_EXPIRY,
    REFRESH_TOKEN_EXPIRY
};
