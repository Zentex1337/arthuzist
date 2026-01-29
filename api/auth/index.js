/**
 * /api/auth - Consolidated auth endpoints
 * POST /api/auth?action=register
 * POST /api/auth?action=login
 * POST /api/auth?action=refresh
 * POST /api/auth?action=logout
 * GET /api/auth?action=me
 */

const { supabase } = require('../../lib/supabase');
const {
    hashPassword, verifyPassword,
    generateAccessToken, generateRefreshToken, verifyRefreshToken,
    hashToken, createCookieHeader, parseCookies
} = require('../../lib/auth');
const { handleCors, requireAuth, checkRateLimit, getClientIP, getUserAgent, isSuperAdmin } = require('../../lib/middleware');
const { validateRegister, validateLogin } = require('../../lib/validators');
const { logActivity } = require('../../lib/logger');

module.exports = async (req, res) => {
    if (handleCors(req, res)) return;

    const action = req.query.action || (req.method === 'GET' ? 'me' : '');

    switch (action) {
        case 'register': return handleRegister(req, res);
        case 'login': return handleLogin(req, res);
        case 'refresh': return handleRefresh(req, res);
        case 'logout': return handleLogout(req, res);
        case 'me': return handleMe(req, res);
        case 'health': return handleHealth(req, res);
        case 'update-profile': return handleUpdateProfile(req, res);
        default: return res.status(400).json({ error: 'Invalid action' });
    }
};

async function handleRegister(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const allowed = await checkRateLimit(req, res, 'register', 5, 3600000);
        if (!allowed) return;

        const validation = validateRegister(req.body);
        if (!validation.valid) {
            return res.status(400).json({ error: 'Validation failed', details: validation.errors });
        }

        const { name, email, password, phone } = validation.data;

        const { data: existingUser } = await supabase
            .from('users').select('id').eq('email', email).single();

        if (existingUser) {
            return res.status(409).json({ error: 'Email already registered' });
        }

        const passwordHash = await hashPassword(password);

        const { data: user, error: createError } = await supabase
            .from('users')
            .insert({ email, password_hash: passwordHash, name, phone: phone || null, role: 'user' })
            .select('id, email, name, role')
            .single();

        if (createError) return res.status(500).json({ error: 'Failed to create user' });

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        await supabase.from('refresh_tokens').insert({
            user_id: user.id,
            token_hash: hashToken(refreshToken),
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days
            user_agent: getUserAgent(req),
            ip_address: getClientIP(req)
        });

        await logActivity(user.id, 'USER_REGISTERED', 'user', user.id, { email: user.email }, req);

        res.setHeader('Set-Cookie', [
            createCookieHeader('access_token', accessToken, { maxAge: 60 * 60, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' }), // 1 hour
            createCookieHeader('refresh_token', refreshToken, { maxAge: 14 * 24 * 60 * 60, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', path: '/api/auth' }) // 14 days
        ]);

        res.status(201).json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role }, accessToken });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Registration failed' });
    }
}

async function handleLogin(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const allowed = await checkRateLimit(req, res, 'login', 5, 15 * 60 * 1000);
        if (!allowed) return;

        const validation = validateLogin(req.body);
        if (!validation.valid) {
            return res.status(400).json({ error: 'Validation failed', details: validation.errors });
        }

        const { email, password } = validation.data;

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email, password_hash, name, role, banned, banned_reason')
            .eq('email', email)
            .single();

        if (userError || !user) {
            await logActivity(null, 'LOGIN_FAILED', 'auth', null, { email, reason: 'user_not_found' }, req);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        if (user.banned) {
            await logActivity(user.id, 'LOGIN_BLOCKED_BANNED', 'auth', user.id, { reason: user.banned_reason }, req);
            return res.status(403).json({ error: 'Account suspended', reason: user.banned_reason || 'Contact support' });
        }

        const validPassword = await verifyPassword(password, user.password_hash);
        if (!validPassword) {
            await logActivity(user.id, 'LOGIN_FAILED', 'auth', user.id, { reason: 'invalid_password' }, req);
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const accessToken = generateAccessToken(user);
        const refreshToken = generateRefreshToken(user);

        const clientIP = getClientIP(req);

        await supabase.from('refresh_tokens').insert({
            user_id: user.id,
            token_hash: hashToken(refreshToken),
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days
            user_agent: getUserAgent(req),
            ip_address: clientIP
        });

        // Save IP and last login to user record
        await supabase.from('users').update({
            last_login: new Date().toISOString(),
            last_ip: clientIP
        }).eq('id', user.id);

        await logActivity(user.id, 'LOGIN_SUCCESS', 'auth', user.id, { ip: clientIP }, req);

        // Cookie expiry (14 days for refresh, 1 hour for access)
        res.setHeader('Set-Cookie', [
            createCookieHeader('access_token', accessToken, { maxAge: 60 * 60, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' }),
            createCookieHeader('refresh_token', refreshToken, { maxAge: 14 * 24 * 60 * 60, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', path: '/api/auth' })
        ]);

        res.status(200).json({ success: true, user: { id: user.id, email: user.email, name: user.name, role: user.role }, accessToken });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed' });
    }
}

async function handleRefresh(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const allowed = await checkRateLimit(req, res, 'token_refresh', 30, 60000);
        if (!allowed) return;

        const cookies = parseCookies(req.headers.cookie);
        const refreshToken = cookies.refresh_token;

        if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });

        const payload = verifyRefreshToken(refreshToken);
        if (!payload) return res.status(401).json({ error: 'Invalid refresh token' });

        const tokenHash = hashToken(refreshToken);
        const { data: tokenRecord } = await supabase
            .from('refresh_tokens')
            .select('*')
            .eq('token_hash', tokenHash)
            .eq('user_id', payload.sub)
            .is('revoked_at', null)
            .gt('expires_at', new Date().toISOString())
            .single();

        if (!tokenRecord) return res.status(401).json({ error: 'Refresh token expired or revoked' });

        const { data: user } = await supabase
            .from('users').select('id, email, name, role, banned').eq('id', payload.sub).single();

        if (!user) return res.status(401).json({ error: 'User not found' });
        if (user.banned) {
            await supabase.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', tokenRecord.id);
            return res.status(403).json({ error: 'Account suspended' });
        }

        const newAccessToken = generateAccessToken(user);
        const newRefreshToken = generateRefreshToken(user);

        await supabase.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('id', tokenRecord.id);
        await supabase.from('refresh_tokens').insert({
            user_id: user.id,
            token_hash: hashToken(newRefreshToken),
            expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days
            user_agent: getUserAgent(req),
            ip_address: getClientIP(req)
        });

        await logActivity(user.id, 'TOKEN_REFRESHED', 'auth', user.id, {}, req);

        res.setHeader('Set-Cookie', [
            createCookieHeader('access_token', newAccessToken, { maxAge: 60 * 60, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' }),
            createCookieHeader('refresh_token', newRefreshToken, { maxAge: 14 * 24 * 60 * 60, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', path: '/api/auth' })
        ]);

        res.status(200).json({ success: true, accessToken: newAccessToken });
    } catch (error) {
        console.error('Token refresh error:', error);
        res.status(500).json({ error: 'Token refresh failed' });
    }
}

async function handleLogout(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const cookies = parseCookies(req.headers.cookie);
        const refreshToken = cookies.refresh_token;

        if (refreshToken) {
            const tokenHash = hashToken(refreshToken);
            await supabase.from('refresh_tokens').update({ revoked_at: new Date().toISOString() }).eq('token_hash', tokenHash);
        }

        res.setHeader('Set-Cookie', [
            createCookieHeader('access_token', '', { maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax' }),
            createCookieHeader('refresh_token', '', { maxAge: 0, httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'Lax', path: '/api/auth' })
        ]);

        res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ error: 'Logout failed' });
    }
}

async function handleMe(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const allowed = await checkRateLimit(req, res, 'auth_me', 60, 60000);
        if (!allowed) return;

        const user = await requireAuth(req, res);
        if (!user) return;

        res.status(200).json({
            success: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                admin_permissions: user.admin_permissions,
                is_super_admin: isSuperAdmin(user)
            }
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Failed to get user' });
    }
}

async function handleHealth(req, res) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // Check database connectivity
        const startTime = Date.now();
        const { error: dbError } = await supabase.from('users').select('id').limit(1);
        const dbLatency = Date.now() - startTime;

        const health = {
            status: dbError ? 'degraded' : 'healthy',
            timestamp: new Date().toISOString(),
            version: '1.0.0',
            services: {
                database: {
                    status: dbError ? 'down' : 'up',
                    latency: dbLatency + 'ms'
                },
                api: {
                    status: 'up'
                }
            },
            uptime: process.uptime ? Math.floor(process.uptime()) + 's' : 'N/A'
        };

        const statusCode = dbError ? 503 : 200;
        res.status(statusCode).json(health);
    } catch (error) {
        console.error('Health check error:', error);
        res.status(503).json({
            status: 'unhealthy',
            timestamp: new Date().toISOString(),
            error: 'Health check failed'
        });
    }
}

async function handleUpdateProfile(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const allowed = await checkRateLimit(req, res, 'update_profile', 10, 60000);
        if (!allowed) return;

        const user = await requireAuth(req, res);
        if (!user) return;

        const { name, phone } = req.body || {};

        // Validate name
        if (!name || typeof name !== 'string' || name.trim().length < 2) {
            return res.status(400).json({ error: 'Name must be at least 2 characters' });
        }

        // Sanitize inputs
        const sanitizedName = name.trim().slice(0, 100);
        const sanitizedPhone = phone ? phone.trim().slice(0, 20) : null;

        // Update user profile
        const { error: updateError } = await supabase
            .from('users')
            .update({
                name: sanitizedName,
                phone: sanitizedPhone,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id);

        if (updateError) {
            console.error('Profile update error:', updateError);
            return res.status(500).json({ error: 'Failed to update profile' });
        }

        await logActivity(user.id, 'PROFILE_UPDATED', 'user', user.id, { name: sanitizedName }, req);

        const requestId = `REQ-${Date.now().toString(36).toUpperCase()}`;
        res.status(200).json({
            success: true,
            message: 'Profile updated successfully',
            requestId
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
}
