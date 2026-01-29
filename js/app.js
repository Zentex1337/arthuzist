/**
 * ARTHUZIST v3.0 - Secure Frontend
 * All sensitive data now handled by secure backend API
 * No credentials stored in frontend code
 */

const CONFIG = {
    API_BASE: '/api',
    // Razorpay key is now returned from the API, not hardcoded
    RAZORPAY_KEY_ID: null
};

// API helper with credentials (uses httpOnly cookies only)
async function apiRequest(endpoint, options = {}) {
    const url = `${CONFIG.API_BASE}${endpoint}`;
    const config = {
        credentials: 'include', // Send httpOnly cookies
        headers: {
            'Content-Type': 'application/json',
            ...options.headers
        },
        ...options
    };

    const response = await fetch(url, config);
    const data = await response.json();

    // Handle 401 - try to refresh token
    if (response.status === 401 && !options._retried) {
        const refreshed = await refreshToken();
        if (refreshed) {
            return apiRequest(endpoint, { ...options, _retried: true });
        }
        cachedUser = null;
    }

    if (!response.ok) {
        throw new Error(data.error || 'Request failed');
    }

    return data;
}

// Refresh access token (relies on httpOnly cookies)
async function refreshToken() {
    try {
        const response = await fetch(`${CONFIG.API_BASE}/auth?action=refresh`, {
            method: 'POST',
            credentials: 'include'
        });
        return response.ok;
    } catch (e) {
        console.error('Token refresh failed:', e);
    }
    return false;
}

let currentOrder = null;

// ==================== UTILITY FUNCTIONS ====================

// Secure ID Generator
function generateId(prefix = '') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}${timestamp}${random}`.toUpperCase();
}

// XSS Prevention - Sanitize Input
function sanitize(str) {
    if (!str) return '';
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#x27;', '/': '&#x2F;' };
    return String(str).replace(/[&<>"'/]/g, char => map[char]);
}

// Rate Limiter
const rateLimiter = {
    attempts: {},
    check(action, maxAttempts = 5, windowMs = 60000) {
        const now = Date.now();
        if (!this.attempts[action]) this.attempts[action] = [];
        this.attempts[action] = this.attempts[action].filter(t => now - t < windowMs);
        if (this.attempts[action].length >= maxAttempts) return false;
        this.attempts[action].push(now);
        return true;
    }
};

// Logging is now handled server-side
// This function is kept for backwards compatibility but does nothing
function addLog(action, details = {}, userId = null) {
    console.log(`[CLIENT LOG] ${action}:`, details);
}

// ==================== SOCIAL SHARE ====================

function shareOnTwitter() {
    const text = encodeURIComponent('Just ordered a custom artwork from Arthuzist! Check out their amazing dark art commissions.');
    const url = encodeURIComponent('https://www.arthuzist.com');
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank', 'width=600,height=400');
}

function shareOnWhatsApp() {
    const text = encodeURIComponent('Check out Arthuzist - Amazing dark art commissions starting from just Rs.1000! https://www.arthuzist.com');
    window.open(`https://wa.me/?text=${text}`, '_blank');
}

function shareOnFacebook() {
    const url = encodeURIComponent('https://www.arthuzist.com');
    window.open(`https://www.facebook.com/sharer/sharer.php?u=${url}`, '_blank', 'width=600,height=400');
}

async function copyShareLink() {
    try {
        await navigator.clipboard.writeText('https://www.arthuzist.com');
        showToast('Link copied to clipboard!', 'success');
    } catch (e) {
        // Fallback
        const ta = document.createElement('textarea');
        ta.value = 'https://www.arthuzist.com';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        showToast('Link copied to clipboard!', 'success');
    }
}

// Current user cache
let cachedUser = null;

// Get Current User from API or cache
function getCurrentUser() {
    return cachedUser;
}

// Fetch current user from API (uses httpOnly cookies)
async function fetchCurrentUser() {
    try {
        const data = await apiRequest('/auth?action=me');
        cachedUser = data.user;
        return cachedUser;
    } catch (e) {
        cachedUser = null;
        return null;
    }
}

// Check if Admin
function isAdmin(user = null) {
    const u = user || getCurrentUser();
    return u && u.role === 'admin';
}

// Handle logout - clears cached user
// Actual token clearing happens via logout.html calling the API
function handleLogout() {
    cachedUser = null;
}

// ==================== TOAST NOTIFICATIONS ====================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    if (!toast) return;
    
    const icon = type === 'success' 
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="M22 4L12 14.01l-3-3"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>';
    
    toast.className = `toast ${type} show`;
    toast.querySelector('.toast-icon').innerHTML = icon;
    toast.querySelector('.toast-message').textContent = message;
    
    setTimeout(() => toast.classList.remove('show'), 4000);
    
    const closeBtn = toast.querySelector('.toast-close');
    if (closeBtn) closeBtn.onclick = () => toast.classList.remove('show');
}

// ==================== INITIALIZATION ====================

document.addEventListener('DOMContentLoaded', async () => {
    // Initialize UI components first
    initPreloader();
    initCursor();
    initNavbar();
    initMobileMenu();
    initSmoothScroll();
    initFireEffect();
    initParticles();
    initCounters();
    initGallery();
    initFAQ();
    initContactForm();
    initScrollAnimations();
    initCharCount();
    updatePrice();

    // New enhanced features
    initScrollProgress();
    initParallax();
    initMagneticButtons();
    initTiltCards();
    initHeroAnimations();
    initCursorParticles();
    initSectionAnimations();
    initSmokeEffect();

    // Fetch current user from API
    await fetchCurrentUser();
    updateAuthState();
});

// ==================== PRELOADER ====================

function initPreloader() {
    const preloader = document.getElementById('preloader');
    if (!preloader) return;

    const hide = () => preloader.classList.add('hidden');
    // Wait for all animations to complete (rose bloom + text reveal + loading bar)
    window.addEventListener('load', () => setTimeout(hide, 5500));
    setTimeout(hide, 7000); // Fallback
}

// ==================== CUSTOM CURSOR ====================

function initCursor() {
    const cursor = document.getElementById('cursor');
    const trail = document.getElementById('cursorTrail');

    if (!cursor || !trail || 'ontouchstart' in window) return;

    let mx = 0, my = 0, cx = 0, cy = 0, tx = 0, ty = 0;

    document.addEventListener('mousemove', e => {
        mx = e.clientX;
        my = e.clientY;
    }, { passive: true });

    function animate() {
        // Smoother interpolation with lerp
        cx += (mx - cx) * 0.35;
        cy += (my - cy) * 0.35;
        cursor.style.transform = `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;

        tx += (mx - tx) * 0.12;
        ty += (my - ty) * 0.12;
        trail.style.transform = `translate3d(${tx}px, ${ty}px, 0) translate(-50%, -50%)`;

        requestAnimationFrame(animate);
    }
    animate();

    // Use event delegation for better performance
    document.body.addEventListener('mouseenter', (e) => {
        if (e.target.matches('a, button, .gallery-item, .btn, .nav-link')) {
            trail.classList.add('hover');
        }
    }, true);

    document.body.addEventListener('mouseleave', (e) => {
        if (e.target.matches('a, button, .gallery-item, .btn, .nav-link')) {
            trail.classList.remove('hover');
        }
    }, true);
}

// ==================== NAVBAR ====================

function initNavbar() {
    const navbar = document.getElementById('navbar');
    if (!navbar) return;
    
    let lastScroll = 0;
    window.addEventListener('scroll', () => {
        const scroll = window.scrollY;
        navbar.classList.toggle('scrolled', scroll > 50);
        lastScroll = scroll;
    }, { passive: true });
}

// ==================== MOBILE MENU ====================

function initMobileMenu() {
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('mobileMenu');
    const backdrop = document.getElementById('mobileBackdrop');
    const closeBtn = document.getElementById('mobileClose');

    if (!toggle || !menu) return;

    function openMenu() {
        toggle.classList.add('active');
        menu.classList.add('active');
        if (backdrop) backdrop.classList.add('active');
        document.body.classList.add('no-scroll');
    }

    function closeMenu() {
        toggle.classList.remove('active');
        menu.classList.remove('active');
        if (backdrop) backdrop.classList.remove('active');
        document.body.classList.remove('no-scroll');
    }

    toggle.addEventListener('click', () => {
        if (menu.classList.contains('active')) {
            closeMenu();
        } else {
            openMenu();
        }
    });

    // Close button
    if (closeBtn) {
        closeBtn.addEventListener('click', closeMenu);
    }

    // Backdrop click to close
    if (backdrop) {
        backdrop.addEventListener('click', closeMenu);
    }

    document.querySelectorAll('.mobile-link').forEach(link => {
        link.addEventListener('click', closeMenu);
    });

    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && menu.classList.contains('active')) {
            closeMenu();
        }
    });
}

// ==================== SMOOTH SCROLL ====================

function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', e => {
            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                window.scrollTo({
                    top: target.offsetTop - 100,
                    behavior: 'smooth'
                });
            }
        });
    });
}

// ==================== FIRE EFFECT (Optimized) ====================

function initFireEffect() {
    const canvas = document.getElementById('fireCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    let width = canvas.width = window.innerWidth;
    let height = canvas.height = 150;
    
    const particles = [];
    const particleCount = 60; // Reduced for performance
    
    class Particle {
        constructor() {
            this.reset();
        }
        
        reset() {
            this.x = Math.random() * width;
            this.y = height;
            this.size = Math.random() * 2 + 1;
            this.speedY = Math.random() * 2 + 1;
            this.life = 1;
            this.decay = Math.random() * 0.02 + 0.01;
        }
        
        update() {
            this.y -= this.speedY;
            this.life -= this.decay;
            if (this.life <= 0) this.reset();
        }
        
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, ${50 + Math.random() * 50}, 0, ${this.life})`;
            ctx.fill();
        }
    }
    
    for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
    }
    
    function animate() {
        ctx.clearRect(0, 0, width, height);
        particles.forEach(p => {
            p.update();
            p.draw();
        });
        requestAnimationFrame(animate);
    }
    
    animate();
    
    window.addEventListener('resize', () => {
        width = canvas.width = window.innerWidth;
    }, { passive: true });
}

// ==================== PARTICLES (Optimized) ====================

function initParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    
    const fragment = document.createDocumentFragment();
    
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.style.cssText = `
            position: absolute;
            width: ${Math.random() * 2 + 1}px;
            height: ${Math.random() * 2 + 1}px;
            background: ${Math.random() > 0.5 ? '#d4af37' : '#444'};
            border-radius: 50%;
            left: ${Math.random() * 100}%;
            top: ${Math.random() * 100}%;
            opacity: ${Math.random() * 0.3 + 0.1};
            animation: floatParticle ${Math.random() * 20 + 15}s linear infinite;
        `;
        fragment.appendChild(particle);
    }
    
    container.appendChild(fragment);
    
    if (!document.getElementById('particleStyles')) {
        const style = document.createElement('style');
        style.id = 'particleStyles';
        style.textContent = '@keyframes floatParticle{0%,100%{transform:translate(0,0)}50%{transform:translate(15px,-20px)}}';
        document.head.appendChild(style);
    }
}

// ==================== COUNTERS ====================

function initCounters() {
    const counters = document.querySelectorAll('[data-target]');
    
    const observer = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                animateCounter(entry.target);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.5 });
    
    counters.forEach(counter => observer.observe(counter));
}

function animateCounter(element) {
    const target = parseInt(element.dataset.target);
    const duration = 2000;
    const start = performance.now();
    
    function update(now) {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic
        element.textContent = Math.floor(eased * target);
        if (progress < 1) requestAnimationFrame(update);
    }
    
    requestAnimationFrame(update);
}

// ==================== GALLERY ====================

function initGallery() {
    loadGalleryItems();
    initFilters();
    initModal();
}

async function loadGalleryItems() {
    const grid = document.getElementById('galleryGrid');
    if (!grid) return;

    let items = [];

    // Load from API
    try {
        const data = await apiRequest('/gallery');
        if (data.gallery && data.gallery.length > 0) {
            items = data.gallery;
        }
    } catch (e) {
        console.log('Gallery API unavailable');
    }

    // Show empty state if no items
    if (items.length === 0) {
        grid.innerHTML = '<div class="gallery-empty" style="grid-column:1/-1;text-align:center;padding:4rem 2rem;color:var(--text-muted);"><p>Gallery coming soon...</p></div>';
        return;
    }

    grid.innerHTML = items.map((item, i) => `
        <div class="gallery-item" data-category="${sanitize(item.category)}" data-index="${i}">
            <img src="${item.image_url || item.image}" alt="${sanitize(item.title)}" loading="lazy"
                 onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1578926288207-a90a5366759d?w=600&h=800&fit=crop'">
            <div class="gallery-overlay">
                <span class="gallery-category">${sanitize(item.categoryLabel || item.category_label || item.category)}</span>
                <h3 class="gallery-title">${sanitize(item.title)}</h3>
            </div>
        </div>
    `).join('');
}


function initFilters() {
    let currentFilter = 'all';
    let currentSearch = '';

    function filterGallery() {
        document.querySelectorAll('.gallery-item').forEach(item => {
            const category = item.dataset.category;
            const title = item.querySelector('.gallery-title')?.textContent?.toLowerCase() || '';
            const matchesFilter = currentFilter === 'all' || category === currentFilter;
            const matchesSearch = !currentSearch || title.includes(currentSearch);
            item.style.display = (matchesFilter && matchesSearch) ? 'block' : 'none';
        });
    }

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentFilter = btn.dataset.filter;
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            filterGallery();
        });
    });

    // Gallery search
    const searchInput = document.getElementById('gallerySearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            currentSearch = e.target.value.toLowerCase().trim();
            filterGallery();
        });
    }
}

function initModal() {
    const modal = document.getElementById('imageModal');
    if (!modal) return;
    
    document.addEventListener('click', e => {
        const item = e.target.closest('.gallery-item');
        if (item) {
            const img = item.querySelector('img');
            document.getElementById('modalImage').src = img.src;
            document.getElementById('modalTitle').textContent = item.querySelector('.gallery-title')?.textContent || '';
            document.getElementById('modalCategory').textContent = item.querySelector('.gallery-category')?.textContent || '';
            modal.classList.add('active');
            document.body.classList.add('no-scroll');
        }
    });
    
    const closeModal = () => {
        modal.classList.remove('active');
        document.body.classList.remove('no-scroll');
    };
    
    modal.querySelector('.modal-close')?.addEventListener('click', closeModal);
    modal.querySelector('.modal-overlay')?.addEventListener('click', closeModal);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

// ==================== FAQ ====================

function initFAQ() {
    document.querySelectorAll('.faq-item').forEach(item => {
        item.querySelector('.faq-question')?.addEventListener('click', () => {
            const wasActive = item.classList.contains('active');
            document.querySelectorAll('.faq-item').forEach(i => i.classList.remove('active'));
            if (!wasActive) item.classList.add('active');
        });
    });
}

// ==================== SCROLL ANIMATIONS ====================

function initScrollAnimations() {
    const elements = document.querySelectorAll('.section-header, .service-card, .gallery-item, .pricing-card, .info-card');
    
    const observer = new IntersectionObserver(entries => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }, i * 30);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });
    
    elements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(20px)';
        el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        observer.observe(el);
    });
}

// ==================== AUTH STATE ====================

function updateAuthState() {
    const user = getCurrentUser();
    const authBtn = document.getElementById('authBtnText');
    
    if (authBtn && user) {
        authBtn.textContent = sanitize(user.name.split(' ')[0]);
    }
}

// ==================== PRICE CALCULATOR ====================

function updatePrice() {
    const serviceEl = document.getElementById('service');
    const sizeEl = document.getElementById('size');
    const addonsEl = document.getElementById('addons');
    
    if (!serviceEl || !sizeEl || !addonsEl) return;
    
    const getPrice = (el) => parseInt(el.options[el.selectedIndex]?.dataset?.price) || 0;
    
    const total = getPrice(serviceEl) + getPrice(sizeEl) + getPrice(addonsEl);
    const advance = Math.ceil(total / 2);
    
    const totalEl = document.getElementById('totalPrice');
    const advanceEl = document.getElementById('advancePrice');
    
    if (totalEl) totalEl.textContent = '₹' + total.toLocaleString('en-IN');
    if (advanceEl) advanceEl.textContent = '₹' + advance.toLocaleString('en-IN');
}

// ==================== CHARACTER COUNT ====================

function initCharCount() {
    const textarea = document.getElementById('message');
    const counter = document.getElementById('charCount');
    
    if (textarea && counter) {
        textarea.addEventListener('input', () => {
            counter.textContent = textarea.value.length;
        });
    }
}

// ==================== CONTACT FORM ====================

function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();

        // Rate limiting (client-side, server also has rate limiting)
        if (!rateLimiter.check('form_submit', 3, 60000)) {
            showToast('Too many attempts. Please wait a minute.', 'error');
            return;
        }

        const btn = document.getElementById('submitBtn');
        btn.classList.add('loading');

        // Get hCaptcha token
        const captchaResponse = typeof hcaptcha !== 'undefined' ? hcaptcha.getResponse() : null;
        if (!captchaResponse) {
            showToast('Please complete the captcha verification', 'error');
            btn.classList.remove('loading');
            return;
        }

        // Collect form data
        const serviceEl = document.getElementById('service');
        const sizeEl = document.getElementById('size');
        const addonsEl = document.getElementById('addons');

        const formData = {
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim().toLowerCase(),
            phone: document.getElementById('phone').value.trim(),
            service: serviceEl.value,
            serviceName: serviceEl.options[serviceEl.selectedIndex].text,
            size: sizeEl.value,
            sizeName: sizeEl.options[sizeEl.selectedIndex].text,
            addons: addonsEl.value || 'none',
            addonsName: addonsEl.options[addonsEl.selectedIndex].text,
            message: document.getElementById('message').value.trim(),
            captchaToken: captchaResponse
        };

        // Client-side validation (server also validates)
        if (!formData.name || formData.name.length < 2) {
            showToast('Please enter a valid name', 'error');
            btn.classList.remove('loading');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(formData.email)) {
            showToast('Please enter a valid email', 'error');
            btn.classList.remove('loading');
            return;
        }

        if (!formData.service || !formData.size) {
            showToast('Please select service and size', 'error');
            btn.classList.remove('loading');
            return;
        }

        if (!formData.message || formData.message.length < 10) {
            showToast('Please describe your vision (min 10 characters)', 'error');
            btn.classList.remove('loading');
            return;
        }

        // Get client-side price for display only
        // Actual price is calculated server-side
        const getPrice = (id) => parseInt(document.getElementById(id).options[document.getElementById(id).selectedIndex]?.dataset?.price) || 0;
        const displayTotal = getPrice('service') + getPrice('size') + getPrice('addons');
        const displayAdvance = Math.ceil(displayTotal / 2);

        // Prepare order for payment modal
        currentOrder = {
            ...formData,
            // These are display values only - server calculates actual price
            total: displayTotal,
            advance: displayAdvance,
            timestamp: new Date().toISOString()
        };

        btn.classList.remove('loading');

        showPaymentModal(currentOrder);
    });
}

// ==================== PAYMENT MODAL ====================

function showPaymentModal(order) {
    const modal = document.getElementById('paymentModal');
    const summary = document.getElementById('orderSummary');
    
    summary.innerHTML = `
        <div class="order-item"><span class="label">Order ID</span><span class="value">${order.id}</span></div>
        <div class="order-item"><span class="label">Name</span><span class="value">${order.name}</span></div>
        <div class="order-item"><span class="label">Service</span><span class="value">${order.serviceName}</span></div>
        <div class="order-item"><span class="label">Size</span><span class="value">${order.sizeName}</span></div>
        <div class="order-item"><span class="label">Add-ons</span><span class="value">${order.addonsName}</span></div>
        <div class="order-item total"><span class="label">Total</span><span class="value">₹${order.total.toLocaleString('en-IN')}</span></div>
    `;
    
    document.getElementById('payBtnAmount').textContent = '₹' + order.advance.toLocaleString('en-IN');
    document.getElementById('paymentBody').style.display = 'block';
    document.getElementById('paymentSuccess').style.display = 'none';
    
    modal.classList.add('active');
    document.body.classList.add('no-scroll');
}

function closePaymentModal() {
    document.getElementById('paymentModal')?.classList.remove('active');
    document.body.classList.remove('no-scroll');
}

// ==================== RAZORPAY INTEGRATION (SECURE) ====================

async function initiateRazorpay() {
    if (!currentOrder) {
        showToast('No order found', 'error');
        return;
    }

    const btn = document.getElementById('payNowBtn');
    btn.disabled = true;
    btn.innerHTML = '<span>Creating order...</span>';

    try {
        // Create order through secure API
        // Price is calculated SERVER-SIDE, not from client
        const data = await apiRequest('/orders', {
            method: 'POST',
            body: JSON.stringify({
                name: currentOrder.name,
                email: currentOrder.email,
                phone: currentOrder.phone,
                service: currentOrder.service,
                size: currentOrder.size,
                addons: currentOrder.addons,
                message: currentOrder.message,
                captchaToken: currentOrder.captchaToken
            })
        });

        if (!data.success) {
            throw new Error(data.error || 'Failed to create order');
        }

        // Store order info from server response
        currentOrder.id = data.order.id;
        currentOrder.order_number = data.order.order_number;
        currentOrder.razorpay_order_id = data.order.razorpay_order_id;
        // Use SERVER-CALCULATED price, not client-side
        currentOrder.advance = data.order.pricing.advance;
        currentOrder.total = data.order.pricing.total;

        // Store Razorpay key from API
        CONFIG.RAZORPAY_KEY_ID = data.razorpay_key;

        // Open Razorpay checkout
        openRazorpayCheckout(data.order.razorpay_order_id, data.order.amount);

    } catch (error) {
        console.error('Order creation failed:', error);
        showToast(error.message || 'Failed to create order', 'error');
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>Pay Now`;
    }
}

function openRazorpayCheckout(razorpayOrderId, amountPaise) {
    const btn = document.getElementById('payNowBtn');

    const options = {
        key: CONFIG.RAZORPAY_KEY_ID,
        amount: amountPaise,
        currency: 'INR',
        name: 'Arthuzist',
        description: `Commission: ${currentOrder.serviceName}`,
        order_id: razorpayOrderId,
        handler: function(response) {
            handlePaymentSuccess(response);
        },
        prefill: {
            name: currentOrder.name,
            email: currentOrder.email,
            contact: currentOrder.phone
        },
        theme: {
            color: '#d4af37'
        },
        modal: {
            ondismiss: function() {
                btn.disabled = false;
                btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>Pay ₹${currentOrder.advance.toLocaleString('en-IN')} Now`;
            }
        }
    };

    const rzp = new Razorpay(options);

    rzp.on('payment.failed', function(response) {
        showToast('Payment failed: ' + response.error.description, 'error');
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="4" width="22" height="16" rx="2"/><path d="M1 10h22"/></svg>Pay ₹${currentOrder.advance.toLocaleString('en-IN')} Now`;
    });

    rzp.open();
}

async function handlePaymentSuccess(response) {
    // Show processing state
    const paymentBody = document.getElementById('paymentBody');
    const paymentSuccess = document.getElementById('paymentSuccess');

    if (paymentBody) {
        paymentBody.innerHTML = '<div style="text-align:center;padding:40px;"><p>Verifying payment...</p></div>';
    }

    try {
        // ============================================
        // CRITICAL: Verify payment on server FIRST
        // Only show success AFTER server confirms
        // ============================================
        const verifyResult = await apiRequest('/payment/verify', {
            method: 'POST',
            body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                order_id: currentOrder.id
            })
        });

        if (!verifyResult.success) {
            throw new Error(verifyResult.error || 'Payment verification failed');
        }

        // Payment verified successfully!
        if (paymentBody) paymentBody.style.display = 'none';
        if (paymentSuccess) paymentSuccess.style.display = 'block';

        // Reset form
        const contactForm = document.getElementById('contactForm');
        if (contactForm) contactForm.reset();

        const charCount = document.getElementById('charCount');
        if (charCount) charCount.textContent = '0';

        // Reset hCaptcha
        if (typeof hcaptcha !== 'undefined') {
            hcaptcha.reset();
        }

        updatePrice();

        showToast(`Payment successful! Order: ${verifyResult.order_number}`, 'success');

    } catch (error) {
        console.error('Payment verification failed:', error);
        showToast('Payment verification failed. Please contact support.', 'error');

        // Show error in modal
        if (paymentBody) {
            paymentBody.innerHTML = `
                <div style="text-align:center;padding:40px;color:#ef4444;">
                    <p style="font-size:1.2em;margin-bottom:10px;">Payment Verification Failed</p>
                    <p>Please contact support with your payment ID:</p>
                    <code style="background:#1a1a1a;padding:5px 10px;border-radius:4px;">${response.razorpay_payment_id}</code>
                </div>
            `;
        }
    }
}

// ==================== SCROLL PROGRESS BAR ====================

function initScrollProgress() {
    const progressBar = document.createElement('div');
    progressBar.className = 'scroll-progress';
    document.body.appendChild(progressBar);

    let ticking = false;

    window.addEventListener('scroll', () => {
        if (!ticking) {
            requestAnimationFrame(() => {
                const scrollTop = window.scrollY;
                const docHeight = document.documentElement.scrollHeight - window.innerHeight;
                const progress = (scrollTop / docHeight) * 100;
                progressBar.style.width = `${progress}%`;
                ticking = false;
            });
            ticking = true;
        }
    }, { passive: true });
}

// ==================== PARALLAX EFFECT ====================

function initParallax() {
    const hero = document.querySelector('.hero-content');
    const particles = document.getElementById('particles');
    const gothicSymbols = document.querySelector('.gothic-symbols');

    if (!hero) return;

    let ticking = false;
    let lastScrollY = 0;

    function updateParallax() {
        const scrolled = lastScrollY;
        const rate = scrolled * 0.3;

        if (hero && scrolled < window.innerHeight) {
            hero.style.transform = `translate3d(0, ${rate}px, 0)`;
            hero.style.opacity = 1 - (scrolled / window.innerHeight);
        }

        if (particles) {
            particles.style.transform = `translate3d(0, ${scrolled * 0.1}px, 0)`;
        }

        if (gothicSymbols) {
            gothicSymbols.style.transform = `translate3d(0, ${scrolled * 0.05}px, 0)`;
        }

        ticking = false;
    }

    window.addEventListener('scroll', () => {
        lastScrollY = window.scrollY;
        if (!ticking) {
            requestAnimationFrame(updateParallax);
            ticking = true;
        }
    }, { passive: true });
}

// ==================== MAGNETIC BUTTONS ====================

function initMagneticButtons() {
    const buttons = document.querySelectorAll('.btn-primary, .nav-btn-primary');

    buttons.forEach(btn => {
        let rafId = null;

        btn.addEventListener('mousemove', (e) => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left - rect.width / 2;
                const y = e.clientY - rect.top - rect.height / 2;
                btn.style.transform = `translate3d(${x * 0.2}px, ${y * 0.2}px, 0)`;
            });
        });

        btn.addEventListener('mouseleave', () => {
            if (rafId) cancelAnimationFrame(rafId);
            btn.style.transform = '';
        });
    });
}

// ==================== TILT CARDS ====================

function initTiltCards() {
    const cards = document.querySelectorAll('.service-card, .pricing-card');

    cards.forEach(card => {
        let rafId = null;

        card.addEventListener('mousemove', (e) => {
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => {
                const rect = card.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;

                const centerX = rect.width / 2;
                const centerY = rect.height / 2;

                const rotateX = (y - centerY) / 25;
                const rotateY = (centerX - x) / 25;

                card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translate3d(0, 0, 10px)`;
            });
        });

        card.addEventListener('mouseleave', () => {
            if (rafId) cancelAnimationFrame(rafId);
            card.style.transform = '';
        });
    });
}

// ==================== HERO ANIMATIONS ====================

function initHeroAnimations() {
    const lines = document.querySelectorAll('.hero-title .line');
    const badge = document.querySelector('.hero-badge');
    const subtitle = document.querySelector('.hero-subtitle');
    const cta = document.querySelector('.hero-cta');
    const stats = document.querySelector('.hero-stats');

    // Animate hero elements on load
    setTimeout(() => {
        lines.forEach((line, i) => {
            setTimeout(() => {
                line.classList.add('visible');
            }, i * 300);
        });
    }, 500);

    // Add glow effect to title on mouse move
    const heroTitle = document.querySelector('.hero-title');
    if (heroTitle) {
        document.addEventListener('mousemove', (e) => {
            const rect = heroTitle.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            heroTitle.style.setProperty('--mouse-x', `${x}px`);
            heroTitle.style.setProperty('--mouse-y', `${y}px`);
        });
    }
}

// ==================== CURSOR PARTICLES ====================

function initCursorParticles() {
    if ('ontouchstart' in window) return;

    let particleCount = 0;
    const maxParticles = 15;
    let lastTime = 0;
    const throttle = 50; // ms between particles

    document.addEventListener('mousemove', (e) => {
        const now = Date.now();
        if (now - lastTime > throttle && Math.random() > 0.85 && particleCount < maxParticles) {
            lastTime = now;
            createParticle(e.clientX, e.clientY);
        }
    }, { passive: true });

    function createParticle(x, y) {
        particleCount++;
        const particle = document.createElement('div');
        particle.className = 'cursor-particle';
        particle.style.cssText = `left:${x}px;top:${y}px;width:${Math.random() * 5 + 2}px;height:${Math.random() * 5 + 2}px;`;

        document.body.appendChild(particle);

        setTimeout(() => {
            particle.remove();
            particleCount--;
        }, 800);
    }
}

// ==================== SMOKE EFFECT ====================

function initSmokeEffect() {
    const container = document.getElementById('smokeContainer');
    if (!container) return;

    // Limit smoke particles for performance
    let smokeCount = 0;
    const maxSmoke = 8;

    function createSmoke() {
        if (smokeCount >= maxSmoke) return;

        smokeCount++;
        const smoke = document.createElement('div');
        smoke.className = 'smoke-particle';
        const size = 40 + Math.random() * 80;
        smoke.style.cssText = `left:${Math.random() * 100}%;width:${size}px;height:${size}px;animation-duration:${5 + Math.random() * 5}s;`;

        container.appendChild(smoke);

        setTimeout(() => {
            smoke.remove();
            smokeCount--;
        }, 10000);
    }

    // Initial smoke particles (staggered)
    for (let i = 0; i < 4; i++) {
        setTimeout(createSmoke, i * 800);
    }

    // Continuously create smoke (less frequent)
    setInterval(createSmoke, 2500);
}

// ==================== SECTION ANIMATIONS ====================

function initSectionAnimations() {
    const sections = document.querySelectorAll('.section');

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('section-animate', 'visible');

                // Animate children with stagger
                const children = entry.target.querySelectorAll('.service-card, .pricing-card, .gallery-item, .info-card, .faq-item');
                children.forEach((child, i) => {
                    setTimeout(() => {
                        child.style.opacity = '1';
                        child.style.transform = 'translateY(0)';
                    }, i * 100);
                });
            }
        });
    }, { threshold: 0.1 });

    sections.forEach(section => {
        section.classList.add('section-animate');
        observer.observe(section);
    });
}

// ==================== SMOOTH REVEAL ON SCROLL ====================

function initScrollAnimations() {
    const elements = document.querySelectorAll('.section-header, .service-card, .gallery-item, .pricing-card, .info-card');

    const observer = new IntersectionObserver(entries => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0) scale(1)';
                }, i * 50);
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '50px' });

    elements.forEach(el => {
        el.style.opacity = '0';
        el.style.transform = 'translateY(30px) scale(0.98)';
        el.style.transition = 'opacity 0.6s cubic-bezier(0.23, 1, 0.32, 1), transform 0.6s cubic-bezier(0.23, 1, 0.32, 1)';
        observer.observe(el);
    });
}

// ==================== EXPORT GLOBALS ====================

window.updatePrice = updatePrice;
window.closePaymentModal = closePaymentModal;
window.initiateRazorpay = initiateRazorpay;
window.showToast = showToast;
window.CONFIG = CONFIG;
window.addLog = addLog;
window.sanitize = sanitize;
window.generateId = generateId;
window.getCurrentUser = getCurrentUser;
window.fetchCurrentUser = fetchCurrentUser;
window.isAdmin = isAdmin;
window.apiRequest = apiRequest;
window.handleLogout = handleLogout;
