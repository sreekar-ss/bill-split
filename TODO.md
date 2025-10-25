# BillSplit - Feature Roadmap & TODO

## 🎉 Completed Features

### Core Authentication & User Management
- ✅ User registration and authentication (JWT)
- ✅ Login/logout functionality
- ✅ Protected routes and API endpoints
- ✅ Password hashing with bcrypt

### Group Management
- ✅ Dashboard with groups overview
- ✅ Create groups
- ✅ Add members to groups (by email)
- ✅ Group detail page with members and activity
- ✅ Group expense tracking

### Expense & Settlement
- ✅ Add expenses to groups
- ✅ Equal split calculation
- ✅ Balance calculation (who owes whom)
- ✅ **Smart debt simplification algorithm** - Minimizes number of transactions
- ✅ **Settle up functionality** - Mark debts as paid between members
- ✅ **Settlement history** - Track settlements in activity timeline
- ✅ Activity timeline (expenses + settlements merged)

### Friend System
- ✅ **Friend system** - Add friends by email
- ✅ **Friends dashboard** - View all friends and their balances
- ✅ **Friend-to-friend expenses** - Add expenses directly with friends (no group needed)
- ✅ **Friend expense details** - View individual friend's expense history
- ✅ Friendship status tracking (pending, accepted)

### Technical Infrastructure
- ✅ PostgreSQL database with Prisma ORM
- ✅ Material-UI v6 responsive design
- ✅ Next.js 15 (App Router) full-stack architecture
- ✅ TypeScript throughout
- ✅ Docker PostgreSQL setup
- ✅ Database migrations with Prisma

---

## 🔥 High Priority (Next Phase)

### Bug Fixes & UX
- [ ] 🐛 **Friends button not visible on mobile** - Add mobile navigation for friends feature
- [ ] **Cross-tab authentication sync** - When user logs in/out in one tab, sync all other tabs automatically (use Storage Events or Broadcast Channel API)
- [ ] Profile page - Edit user profile, avatar upload, change password
- [ ] Forgot password functionality
- [ ] Email verification

### Expense Management
- [ ] **Receipt upload** - Allow users to attach receipt photos
- [ ] **Receipt OCR** - Auto-extract amount and items from receipt images (Tesseract.js)
- [ ] **Unequal splits** - Split by percentage or exact amounts
- [ ] **Itemized splits** - Split individual items from a receipt (you had pizza, I had burger)
- [ ] Edit/delete expenses
- [ ] Expense categories (food, rent, travel, utilities, etc.)
- [ ] Multiple currencies with conversion

### Settlement Enhancements
- [ ] Payment method tracking (cash, Venmo, PayPal, etc.)
- [ ] Payment integration (Stripe, PayPal)
- [ ] Payment reminders
- [ ] Settle up for friend expenses (currently only group expenses)

---

## 📊 Medium Priority

### Analytics & Insights
- [ ] Spending analytics dashboard
  - Category breakdown (pie charts)
  - Monthly trends (line charts)
  - Group spending comparison
  - Top spenders
- [ ] Budget tracking per group
- [ ] Spending predictions based on history
- [ ] Export data (CSV, PDF reports)

### Group Features
- [ ] Edit group details
- [ ] Delete/archive groups
- [ ] Group settings
- [ ] Remove members from group
- [ ] Group icons/avatars
- [ ] Group categories

### Social Features
- [ ] Comments on expenses
- [ ] Notifications (in-app, email, push)
- [ ] User search
- [ ] Friend requests (accept/reject)
- [ ] Friend removal
- [ ] Friend status indicators

---

## 🚀 Low Priority / Future Enhancements

### Advanced Features
- [ ] **Recurring expenses** - Weekly rent, monthly subscriptions
- [ ] Split by shares (1:2:3 ratio splits)
- [ ] Tax and tip calculator
- [ ] Multi-group view (see all balances across groups)
- [ ] Expense templates (save common expense patterns)
- [ ] Bulk expense import (CSV)

### Real-time Features
- [ ] WebSocket integration (Socket.io)
- [ ] Real-time expense updates
- [ ] Online status indicators
- [ ] Live notifications
- [ ] Collaborative editing

### Gamification
- [ ] Achievement badges
- [ ] Settlement streaks
- [ ] Leaderboards (fastest payers, most active)
- [ ] Profile statistics
- [ ] "Split stories" (share settlement achievements)

### Mobile & PWA
- [ ] Progressive Web App (PWA) support
- [ ] Offline mode
- [ ] Push notifications
- [ ] Mobile-optimized UI
- [ ] Install as app

### Admin & Management
- [ ] Admin dashboard
- [ ] User management
- [ ] Analytics dashboard
- [ ] Backup and restore
- [ ] Data export/import

---

## 🐛 Known Issues / Tech Debt

- [ ] Grid warnings in Material-UI v6 (consider migrating to Grid2 completely)
- [ ] Token refresh mechanism (currently tokens expire in 7 days)
- [ ] Error handling improvements (better error messages)
- [ ] Loading states consistency
- [ ] Add proper TypeScript types everywhere
- [ ] Add unit tests (Jest, React Testing Library)
- [ ] Add E2E tests (Playwright, Cypress)
- [ ] Performance optimization (React Query for caching)
- [ ] SEO optimization (meta tags, og:image)

---

## 🎨 UI/UX Improvements

- [ ] 🐛 **Mobile navigation menu** - Add hamburger menu or bottom nav for Friends on mobile
- [ ] Dark mode toggle
- [ ] Custom color themes
- [ ] Skeleton loaders for better perceived performance
- [ ] Toast notifications (success/error feedback)
- [ ] Empty states with illustrations
- [ ] Onboarding tutorial for new users
- [ ] Keyboard shortcuts
- [ ] Accessibility improvements (ARIA labels, screen reader support)
- [ ] Better responsive layouts for all pages

---

## 🔒 Security & Performance

- [ ] Rate limiting on API endpoints
- [ ] Input sanitization and validation
- [ ] XSS protection
- [ ] CSRF protection
- [ ] Database query optimization
- [ ] Caching strategy (Redis)
- [ ] CDN for static assets
- [ ] Image optimization
- [ ] Code splitting and lazy loading
- [ ] Database indexes optimization

---

## 📝 Documentation

- [ ] API documentation (Swagger/OpenAPI)
- [ ] User guide / Help center
- [ ] Developer setup guide
- [ ] Deployment guide
- [ ] Architecture documentation
- [ ] Contributing guidelines

---

## 🌐 Deployment & DevOps

- [ ] Environment configuration (dev, staging, prod)
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Docker containerization
- [ ] Production deployment (Vercel/Railway/Fly.io)
- [ ] Database migrations strategy
- [ ] Monitoring and logging (Sentry, LogRocket)
- [ ] Performance monitoring
- [ ] Backup strategy

---

## 💡 Ideas to Consider

- Integration with Venmo/PayPal/Zelle
- Calendar view for expenses
- Expense templates (common expenses)
- Bill reminders
- Group chat/messaging
- QR code for easy group joining
- Trip planner integration
- Expense approval workflow
- Multi-language support (i18n)
- AI-powered expense categorization
- Voice input for adding expenses

---

## 📅 Version History

### v0.1.0 - MVP ✅ (Completed)
- Basic authentication
- Group creation and management
- Expense tracking with equal split
- Balance calculation

### v0.2.0 - Current 🚀
- ✅ Smart debt simplification algorithm
- ✅ Settle up functionality
- ✅ Settlement history tracking
- ✅ Friend system (add, view, manage friends)
- ✅ Friend-to-friend expenses (direct expenses without groups)
- ✅ Friends dashboard with balances
- 🔄 Mobile navigation improvements (in progress)

### v0.3.0 - Planned
- Cross-tab auth sync
- Profile management
- Receipt upload & OCR
- Unequal splits (percentage/exact amounts)
- Expense editing/deletion
- Payment method tracking

---

**Last Updated:** October 25, 2025

