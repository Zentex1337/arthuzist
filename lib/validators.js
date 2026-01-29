/**
 * Input Validation
 * Uses Joi for schema validation
 */

const Joi = require('joi');

// User registration schema
const registerSchema = Joi.object({
    name: Joi.string()
        .min(2)
        .max(100)
        .required(),
    email: Joi.string()
        .email()
        .max(255)
        .required()
        .lowercase(),
    password: Joi.string()
        .min(8)
        .max(128)
        .pattern(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
        .required()
        .messages({
            'string.min': 'Password must be at least 8 characters',
            'string.pattern.base': 'Password must contain uppercase, lowercase, and a number'
        }),
    phone: Joi.string()
        .allow('')
        .optional()
});

// Login schema
const loginSchema = Joi.object({
    email: Joi.string()
        .email()
        .required()
        .lowercase(),
    password: Joi.string()
        .required()
});

// Order creation schema
const orderSchema = Joi.object({
    name: Joi.string()
        .min(2)
        .max(100)
        .pattern(/^[a-zA-Z\s'-]+$/)
        .required()
        .messages({
            'string.pattern.base': 'Name contains invalid characters'
        }),
    email: Joi.string()
        .email()
        .max(255)
        .required()
        .lowercase(),
    phone: Joi.string()
        .pattern(/^[\d\s+()-]{7,20}$/)
        .allow('')
        .optional(),
    service: Joi.string()
        .valid('charcoal', 'anime', 'couple', 'custom')
        .required(),
    size: Joi.string()
        .valid('a4', 'a3')
        .required(),
    addons: Joi.string()
        .valid('none', 'framing', 'express', 'both')
        .default('none'),
    message: Joi.string()
        .min(10)
        .max(1000)
        .required()
});

// Ticket creation schema
const ticketSchema = Joi.object({
    order_id: Joi.string()
        .uuid()
        .optional(),
    subject: Joi.string()
        .min(1)
        .max(200)
        .required(),
    category: Joi.string()
        .valid('order', 'payment', 'revision', 'general', 'refund', 'other')
        .required(),
    message: Joi.string()
        .min(1)
        .max(2000)
        .required()
});

// Ticket message schema
const messageSchema = Joi.object({
    message: Joi.string()
        .min(1)
        .max(2000)
        .required(),
    attachments: Joi.array()
        .items(Joi.object({
            name: Joi.string().max(255).optional(),
            type: Joi.string().max(100).optional(),
            url: Joi.string().max(500000).required() // Allow base64 images
        }))
        .max(5)
        .optional()
        .default([])
});

// Gallery item schema
const gallerySchema = Joi.object({
    image: Joi.string()
        .max(5000000)  // Allow base64 images up to ~5MB
        .required(),
    title: Joi.string()
        .min(2)
        .max(100)
        .required(),
    description: Joi.string()
        .max(500)
        .optional(),
    category: Joi.string()
        .valid('charcoal', 'anime', 'portrait', 'couple', 'custom')
        .required()
});

/**
 * Validate data against schema
 */
function validate(schema, data) {
    const { error, value } = schema.validate(data, {
        abortEarly: false,
        stripUnknown: true
    });

    if (error) {
        return {
            valid: false,
            error: error.details.map(d => d.message).join(', '),
            errors: error.details.map(d => ({
                field: d.path.join('.'),
                message: d.message
            }))
        };
    }

    // Sanitize strings
    for (const key in value) {
        if (typeof value[key] === 'string') {
            value[key] = sanitizeString(value[key]);
        }
    }

    return { valid: true, data: value };
}

/**
 * Sanitize string input
 */
function sanitizeString(str) {
    if (!str) return '';
    return str
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .trim();
}

// Export validation functions
module.exports = {
    validateRegister: (data) => validate(registerSchema, data),
    validateLogin: (data) => validate(loginSchema, data),
    validateOrder: (data) => validate(orderSchema, data),
    validateTicket: (data) => validate(ticketSchema, data),
    validateMessage: (data) => validate(messageSchema, data),
    validateGallery: (data) => validate(gallerySchema, data),
    sanitizeString
};
