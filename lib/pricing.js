/**
 * Server-Side Pricing
 * This is the SOURCE OF TRUTH for all pricing
 * Never trust client-provided amounts
 */

const { supabase } = require('./supabase');

// Cache pricing for 5 minutes to reduce DB calls
let pricingCache = null;
let cacheExpiry = 0;

/**
 * Get pricing configuration from database
 */
async function getPricing() {
    const now = Date.now();

    // Return cached pricing if still valid
    if (pricingCache && cacheExpiry > now) {
        return pricingCache;
    }

    // Fetch fresh pricing from database
    const [servicesResult, sizesResult, addonsResult] = await Promise.all([
        supabase.from('pricing_config').select('*').eq('is_active', true),
        supabase.from('size_pricing').select('*').eq('is_active', true),
        supabase.from('addon_pricing').select('*').eq('is_active', true)
    ]);

    // Build pricing lookup objects
    const services = {};
    (servicesResult.data || []).forEach(s => {
        services[s.service_key] = {
            name: s.service_name,
            price: s.base_price
        };
    });

    const sizes = {};
    (sizesResult.data || []).forEach(s => {
        sizes[s.size_key] = {
            name: s.size_name,
            price: s.additional_price
        };
    });

    const addons = {};
    (addonsResult.data || []).forEach(a => {
        addons[a.addon_key] = {
            name: a.addon_name,
            price: a.additional_price
        };
    });

    // Fallback to hardcoded defaults if DB is empty
    if (Object.keys(services).length === 0) {
        services.charcoal = { name: 'Charcoal Portrait', price: 1500 };
        services.anime = { name: 'Anime Art', price: 1000 };
        services.couple = { name: 'Couple Portrait', price: 3000 };
        services.custom = { name: 'Custom', price: 2000 };
    }

    if (Object.keys(sizes).length === 0) {
        sizes.a4 = { name: 'A4 (standard)', price: 0 };
        sizes.a3 = { name: 'A3', price: 1500 };
    }

    if (Object.keys(addons).length === 0) {
        addons.none = { name: 'None', price: 0 };
        addons.framing = { name: 'Framing', price: 600 };
        addons.express = { name: 'Express Delivery', price: 500 };
        addons.both = { name: 'Framing + Express', price: 1100 };
    }

    pricingCache = { services, sizes, addons };
    cacheExpiry = now + 5 * 60 * 1000; // 5 minutes

    return pricingCache;
}

/**
 * Calculate order price SERVER-SIDE
 * This is the ONLY place prices should be calculated
 */
async function calculateOrderPrice(service, size, addons = 'none') {
    const pricing = await getPricing();

    const serviceData = pricing.services[service];
    const sizeData = pricing.sizes[size];
    const addonData = pricing.addons[addons] || pricing.addons.none;

    if (!serviceData) {
        throw new Error(`Invalid service: ${service}`);
    }

    if (!sizeData) {
        throw new Error(`Invalid size: ${size}`);
    }

    const basePrice = serviceData.price;
    const sizePrice = sizeData.price;
    const addonsPrice = addonData.price;
    const total = basePrice + sizePrice + addonsPrice;
    const advance = Math.ceil(total / 2);
    const remaining = total - advance;

    return {
        service: {
            key: service,
            name: serviceData.name,
            price: basePrice
        },
        size: {
            key: size,
            name: sizeData.name,
            price: sizePrice
        },
        addons: {
            key: addons,
            name: addonData.name,
            price: addonsPrice
        },
        basePrice,
        sizePrice,
        addonsPrice,
        total,
        advance,
        remaining
    };
}

/**
 * Clear pricing cache (call after admin updates pricing)
 */
function clearPricingCache() {
    pricingCache = null;
    cacheExpiry = 0;
}

module.exports = {
    getPricing,
    calculateOrderPrice,
    clearPricingCache
};
