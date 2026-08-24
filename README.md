# Event Content Portal

**Admin panel for managing event content, branding, and settings**

A self-serve web-based admin platform for event organizers to configure and manage all aspects of their events without direct database access.

---

## 📋 Project Overview

This portal replaces manual SQL updates with an intuitive UI for:

- Event branding (hero images, color themes, terminology)
- Facilitator/speaker management
- Agenda scheduling & speaker assignment
- Activities & excursions
- Networking questionnaire configuration
- FAQs, emergency contacts, photo gallery curation
- Event access codes & member management
- Activity logging & audit trails

**Built with:** Next.js 14, TypeScript, Tailwind CSS, React Hook Form, Zod, Supabase

---

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Supabase account & project

### Installation

1. **Clone the repository**

   ```bash
   git clone <repo-url>
   cd event-content-portal
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Set up environment variables**

   ```bash
   cp .env.example .env.local
   ```

   Edit `.env.local` with your Supabase credentials:

   ```env
   NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000)

---

## 📁 Project Structure

```
event-content-portal/
├── docs/                          # Documentation
│   ├── SCOPE.md                  # Project scope & features
│   ├── ARCHITECTURE.md           # Technical design & patterns
│   ├── BLUEPRINT.md              # Implementation guide
│   └── IMPLEMENATION.md          # Build brief & requirements
├── src/
│   ├── app/                      # Next.js App Router
│   │   ├── layout.tsx            # Root layout with providers
│   │   ├── page.tsx              # Home page
│   │   ├── auth/                 # Authentication pages
│   │   ├── portal/               # Portal pages (protected)
│   │   │   └── events/[eventId]/ # Event-specific editors
│   │   └── api/                  # API routes & RPC calls
│   ├── components/               # React components
│   ├── contexts/                 # React Context (auth, events)
│   ├── hooks/                    # Custom React hooks
│   ├── lib/                      # Utilities & helpers
│   ├── services/                 # Supabase data services
│   ├── types/                    # TypeScript types & schemas
│   └── globals.css               # Global Tailwind styles
├── public/                        # Static assets
├── package.json                   # Dependencies
├── tsconfig.json                  # TypeScript config
├── next.config.js                # Next.js config
├── tailwind.config.js            # Tailwind CSS config
└── README.md                      # This file
```

---

## 🔧 Available Scripts

```bash
npm run dev          # Start development server
npm run build        # Build for production
npm start           # Start production server
npm run lint        # Run ESLint
npm run type-check  # Run TypeScript type checker
npm run format      # Format code with Prettier
npm run format:check # Check code formatting
```

---

## 🏗️ Architecture Overview

### Tech Stack

| Layer                | Technology                             |
| -------------------- | -------------------------------------- |
| **Frontend**         | Next.js 14 + React 18 + TypeScript     |
| **Styling**          | Tailwind CSS + custom components       |
| **State Management** | React Context + Zustand                |
| **Forms**            | React Hook Form + Zod                  |
| **Backend**          | Supabase (PostgreSQL)                  |
| **Auth**             | Supabase Auth + MFA (TOTP)             |
| **Storage**          | Supabase Storage (event-assets bucket) |
| **Drag & Drop**      | dnd-kit                                |
| **UI Components**    | Headless primitives + Tailwind         |

### Key Features

✅ **Authentication**

- Email/password sign-in with Supabase Auth
- MFA (TOTP) required for admin/organizer roles
- Session management via secure cookies
- Password reset via email

✅ **Authorization**

- Role-based access control (RBAC)
- Event-scoped content via `event_id` FK
- Row-Level Security (RLS) policies enforced at database layer
- Audit logging of all mutations

✅ **Event Management**

- Event switcher (multi-tenant support)
- 14+ editor sections for comprehensive event configuration
- Real-time validation & error handling
- Optimistic UI updates with rollback

✅ **Content Editors**

- Hero & branding (images, colors, terminology)
- Facilitator/speaker directory with avatar uploads
- Agenda builder with multi-speaker assignment
- Activities with gallery images
- Networking questionnaire builder (form-builder UI)
- FAQs, emergency contacts, photo gallery moderation
- Games/trivia content management
- Access code issuance & member management

✅ **Security**

- Supabase RLS policies protect all data
- Service role key never shipped to browser
- File upload validation (type, size, scanning)
- Sanitized text input to prevent XSS
- Secure token hashing for invites
- Activity log for audit trails

---

## 📚 Documentation

### Getting Started

1. Read [docs/SCOPE.md](docs/SCOPE.md) for project vision & feature list
2. Study [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for technical design
3. Follow [docs/BLUEPRINT.md](docs/BLUEPRINT.md) for implementation steps

### Database

- Ensure Supabase RLS policies are in place (see ARCHITECTURE.md §4)
- Required tables: `events`, `event_members`, `organization_members`, and all content tables
- Required new tables: `event_content_audit_log`, `event_invites`
- Required storage bucket: `event-assets` with event-scoped RLS policies

### Backend Requirements

Before running the portal, ensure your Supabase project has:

- ✅ All event-scoped tables with RLS policies
- ✅ `event-assets` storage bucket with public read access
- ⚠️ `event_content_audit_log` table (new, must create)
- ⚠️ `event_invites` table (new, must create)
- ⚠️ Games service scoped by `event_id` (fix in mobile & portal)

See [docs/BLUEPRINT.md §1.1](docs/BLUEPRINT.md#11-backend-setup) for detailed schema setup.

---

## 🔐 Security Checklist

- [ ] Supabase RLS policies deployed
- [ ] Service role key stored in server-only env vars (never in browser)
- [ ] TOTP MFA enforcement enabled for admin roles
- [ ] File upload bucket RLS configured
- [ ] Audit log table created and RLS applied
- [ ] Invite token hashing implemented
- [ ] CSP headers configured (optional)
- [ ] CORS restricted (Supabase handles)

---

## 🧪 Testing

### Manual Testing

1. Create org account → create event → edit basics
2. Verify image upload works
3. Check MFA enrollment flow
4. Invite co-organizer → verify token flow
5. Test access denial for non-organizers

### Automated Testing (Phase 2)

- Unit tests: services, validation schemas
- Integration tests: auth flow, CRUD operations
- E2E tests: Playwright (full user journeys)

---

## 📊 Deployment

### Vercel (Recommended)

1. Push to GitHub
2. Connect repo to Vercel
3. Add environment variables:
   ```
   NEXT_PUBLIC_SUPABASE_URL
   NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```
4. Deploy

### Other Platforms

Works with any Node.js hosting (Netlify, Render, AWS, etc.)

**Build & Start:**

```bash
npm run build
npm start
```

---

## 🚦 Project Status

### Phase 1: Foundation (In Progress)

- [ ] Auth & sign-in
- [ ] Event switcher
- [ ] Event Basics editor
- [ ] Hero & Branding editor
- [ ] Image upload
- [ ] Access control gating

### Phase 2: Core Content (Planned)

- [ ] Facilitators CRUD
- [ ] Agenda + speaker assignment
- [ ] Activities manager
- [ ] Networking questionnaire builder
- [ ] FAQs manager

### Phase 3: Extended Features (Planned)

- [ ] Emergency contacts
- [ ] Info center contacts
- [ ] Games manager
- [ ] Photo gallery moderation
- [ ] Members & access codes

### Phase 4: Polish & Launch (Planned)

- [ ] Real-time sync
- [ ] Error handling pass
- [ ] Performance optimization
- [ ] UAT & launch

---

## 📞 Support & Contributing

### Getting Help

1. Check [docs/](docs/) for comprehensive guides
2. Review GitHub issues
3. Consult architecture patterns in ARCHITECTURE.md

### Contributing

1. Follow TypeScript strict mode
2. Use Zod schemas for validation
3. Test RLS policies in Supabase console
4. Run `npm run format` before commit
5. Add tests for new features

---

## 📄 License

[Add your license here]

---

## 👥 Team

Built by [Your Team/Organization]

---

## 🗺️ Roadmap

See [docs/SCOPE.md §10](docs/SCOPE.md#10-roadmap--phases) for detailed phased roadmap

---

_Last Updated: 2026-07-20_  
_Next Review: Project kickoff_
