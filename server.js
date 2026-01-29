/**
 * Local Development Server
 * Run with: node server.js
 */

require('dotenv').config();

const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 3000;

// MIME types
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// API route handlers
const apiRoutes = {
    'POST /api/auth/register': require('./api/auth/register'),
    'POST /api/auth/login': require('./api/auth/login'),
    'POST /api/auth/logout': require('./api/auth/logout'),
    'GET /api/auth/me': require('./api/auth/me'),
    'POST /api/auth/refresh': require('./api/auth/refresh'),
    'GET /api/orders': require('./api/orders/index'),
    'POST /api/orders': require('./api/orders/index'),
    'GET /api/tickets': require('./api/tickets/index'),
    'POST /api/tickets': require('./api/tickets/index'),
    'GET /api/gallery': require('./api/gallery/index'),
    'POST /api/gallery': require('./api/gallery/index'),
    'GET /api/admin/users': require('./api/admin/users'),
    'GET /api/admin/logs': require('./api/admin/logs'),
    'GET /api/admin/stats': require('./api/admin/stats'),
    'POST /api/payment/create-order': require('./api/payment/create-order'),
    'POST /api/payment/verify': require('./api/payment/verify'),
    'POST /api/payment/webhook': require('./api/payment/webhook'),
};

// Dynamic route handlers
const dynamicRoutes = [
    { pattern: /^GET \/api\/orders\/([^\/]+)$/, handler: require('./api/orders/[id]') },
    { pattern: /^PATCH \/api\/orders\/([^\/]+)$/, handler: require('./api/orders/[id]') },
    { pattern: /^GET \/api\/tickets\/([^\/]+)$/, handler: require('./api/tickets/[id]') },
    { pattern: /^PATCH \/api\/tickets\/([^\/]+)$/, handler: require('./api/tickets/[id]') },
    { pattern: /^DELETE \/api\/tickets\/([^\/]+)$/, handler: require('./api/tickets/[id]') },
    { pattern: /^GET \/api\/tickets\/([^\/]+)\/messages$/, handler: require('./api/tickets/[id]/messages') },
    { pattern: /^POST \/api\/tickets\/([^\/]+)\/messages$/, handler: require('./api/tickets/[id]/messages') },
    { pattern: /^GET \/api\/gallery\/([^\/]+)$/, handler: require('./api/gallery/[id]') },
    { pattern: /^PATCH \/api\/gallery\/([^\/]+)$/, handler: require('./api/gallery/[id]') },
    { pattern: /^DELETE \/api\/gallery\/([^\/]+)$/, handler: require('./api/gallery/[id]') },
    { pattern: /^PATCH \/api\/admin\/users\/([^\/]+)\/ban$/, handler: require('./api/admin/users/[id]/ban') },
];

const server = http.createServer(async (req, res) => {
    // Add Express-like helper methods
    res.status = (code) => {
        res.statusCode = code;
        return res;
    };
    res.json = (data) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify(data));
    };
    res.send = (data) => {
        res.end(data);
    };

    const url = new URL(req.url, `http://localhost:${PORT}`);
    const pathname = url.pathname;

    // Parse body for POST/PATCH requests
    let body = '';
    if (['POST', 'PATCH', 'PUT'].includes(req.method)) {
        body = await new Promise((resolve) => {
            let data = '';
            req.on('data', chunk => data += chunk);
            req.on('end', () => resolve(data));
        });
        try {
            req.body = JSON.parse(body || '{}');
        } catch {
            req.body = {};
        }
    }

    // Parse query params
    req.query = Object.fromEntries(url.searchParams);

    // Check API routes
    if (pathname.startsWith('/api/')) {
        const routeKey = `${req.method} ${pathname}`;

        // Check static routes
        if (apiRoutes[routeKey]) {
            return apiRoutes[routeKey](req, res);
        }

        // Check dynamic routes
        for (const route of dynamicRoutes) {
            const match = routeKey.match(route.pattern);
            if (match) {
                req.query.id = match[1];
                return route.handler(req, res);
            }
        }

        // 404 for unknown API routes
        res.writeHead(404, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ error: 'API endpoint not found' }));
    }

    // Serve static files
    let filePath = pathname === '/' ? '/index.html' : pathname;
    filePath = path.join(__dirname, filePath);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
        // Try adding .html
        if (fs.existsSync(filePath + '.html')) {
            filePath = filePath + '.html';
        } else {
            res.writeHead(404);
            return res.end('Not Found');
        }
    }

    // Check if it's a directory
    if (fs.statSync(filePath).isDirectory()) {
        filePath = path.join(filePath, 'index.html');
    }

    const ext = path.extname(filePath);
    const contentType = mimeTypes[ext] || 'application/octet-stream';

    try {
        const content = fs.readFileSync(filePath);
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    } catch (err) {
        res.writeHead(500);
        res.end('Server Error');
    }
});

server.listen(PORT, () => {
    console.log(`
╔═══════════════════════════════════════════════════╗
║                                                   ║
║   🎨 ARTHUZIST Local Server                       ║
║                                                   ║
║   Running at: http://localhost:${PORT}              ║
║                                                   ║
║   Press Ctrl+C to stop                            ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
    `);
});
