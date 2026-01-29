# Arthuzist v3.0 - Complete Art Commission Website

A dark gothic themed website with full functionality including:
- Automated Razorpay payments
- Auto-ticket creation after payment
- Complete admin dashboard with user management
- Activity logging system
- Security features (XSS prevention, rate limiting)
- Performance optimized

## 🔐 ADMIN LOGIN

**Email:** arthuzist@gmail.com
**Password:** arthuzist@2024

⚠️ CHANGE THE PASSWORD IN `auth.html` and `js/app.js` before deploying!

## ✨ Features

### Payment Flow (Automated)
1. Customer fills form → Selects service/size/addons
2. Price auto-calculated
3. Click "Proceed to Payment" → Order summary
4. Click "Pay Now" → Razorpay checkout
5. Payment success → Order saved + **Ticket auto-created**
6. Admin sees order + ticket in dashboard

### Admin Dashboard
- **Dashboard**: Stats overview, recent orders
- **Orders**: All orders with status
- **Tickets**: Reply to tickets, change status
- **Gallery**: Upload/delete artworks
- **Users**: View all users, Ban/Unban users
- **Logs**: Activity logs, Export to .txt file

### Security Features
- XSS Prevention (input sanitization)
- Rate Limiting (form submissions)
- Password hashing
- Admin-only route protection
- User ban system

### Logging System
All actions are logged:
- User signups/logins
- Admin logins
- Ticket creation/replies
- Payment events
- User bans/unbans
- Artwork uploads/deletions

## 📁 Files

```
arthuzist-v3/
├── index.html          # Main page + payment
├── auth.html           # Login/Signup + User dashboard
├── tickets.html        # User ticket system
├── testimonials.html   # Reviews page
├── css/styles.css      # Optimized CSS
├── js/app.js           # Complete JS + security
├── admin/index.html    # Full admin dashboard
├── api/
│   ├── create-order.js
│   └── verify-payment.js
├── vercel.json
└── package.json
```

## 🚀 Deployment

### 1. Update Credentials
Edit `js/app.js`:
```javascript
RAZORPAY_KEY_ID: 'rzp_test_YOUR_KEY',
ADMIN_EMAIL: 'your@email.com',
ADMIN_PASSWORD: 'your_secure_password',
```

Edit `auth.html`:
```javascript
ADMIN_EMAIL: 'your@email.com',
ADMIN_PASSWORD: 'your_secure_password',
```

### 2. Deploy to Vercel
```bash
npm i -g vercel
vercel login
cd arthuzist-v3
vercel
vercel env add RAZORPAY_KEY_ID
vercel env add RAZORPAY_KEY_SECRET
vercel --prod
```

## 💰 Pricing
- Charcoal Portrait: ₹1,500
- Anime Art: ₹1,000
- Couple Portrait: ₹3,000
- A3 Size: +₹1,500
- Framing: +₹600
- Express: +₹500

## 📧 Contact
- Email: arthuzist@gmail.com
- Instagram: @arthuzist

---
Made with 🖤 | v3.0
