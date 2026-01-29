<div align="center">

# Arthuzist

**Art Commission Platform with Payments & Admin Dashboard**

![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=node.js&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-3FCF8E?style=for-the-badge&logo=supabase&logoColor=white)
![Razorpay](https://img.shields.io/badge/Razorpay-0C2451?style=for-the-badge&logo=razorpay&logoColor=white)
![Vercel](https://img.shields.io/badge/Vercel-000?style=for-the-badge&logo=vercel&logoColor=white)

</div>

---

## Features

**Payments**
- Razorpay integration with auto-checkout
- Dynamic pricing based on service/size/addons
- Auto-ticket creation after payment

**Admin Dashboard**
- Order management with status tracking
- Ticket system with replies
- Gallery uploads
- User management (ban/unban)
- Activity logs with export

**Security**
- XSS prevention & input sanitization
- Rate limiting on forms
- JWT authentication
- Password hashing with bcrypt
- Admin-only route protection

---

## Tech Stack

| Layer | Tech |
|-------|------|
| Frontend | HTML, CSS, JavaScript |
| Backend | Node.js, Vercel Serverless |
| Database | Supabase (PostgreSQL) |
| Payments | Razorpay |
| Auth | JWT, bcrypt |

---

## Project Structure

```
├── index.html           # Landing + payment flow
├── auth.html            # Login/signup
├── tickets.html         # User tickets
├── admin/index.html     # Admin dashboard
├── api/
│   ├── create-order.js  # Razorpay order creation
│   └── verify-payment.js
├── server.js            # Express server
├── js/app.js            # Frontend logic
└── css/styles.css
```

---

## Setup

**1. Clone & Install**
```bash
git clone https://github.com/Zentex1337/arthuzist.git
cd arthuzist
npm install
```

**2. Environment Variables**
```bash
cp .env.example .env
```

Add your keys:
```
RAZORPAY_KEY_ID=your_key
RAZORPAY_KEY_SECRET=your_secret
SUPABASE_URL=your_url
SUPABASE_KEY=your_key
JWT_SECRET=your_secret
```

**3. Deploy**
```bash
vercel
vercel env add RAZORPAY_KEY_ID
vercel env add RAZORPAY_KEY_SECRET
vercel --prod
```

---

## Screenshots

> Add screenshots of your landing page, admin dashboard, and payment flow here

---

## License

MIT

---

<div align="center">

**[Live Demo](https://arthuzist.vercel.app)** · **[Report Bug](https://github.com/Zentex1337/arthuzist/issues)**

</div>
