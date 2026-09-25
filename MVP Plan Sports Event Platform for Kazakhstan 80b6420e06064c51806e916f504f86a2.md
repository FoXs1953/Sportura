# MVP Plan: Sports Event Platform for Kazakhstan

<aside>
🎯

**Product vision**

Enable anyone in Kazakhstan to discover and join sports activities: daily casual games, recurring game slots, tournaments, and leagues.

**Initial launch**: Astana · mobile-first web app (PWA) · target: 1–2 months

**Two operating models**: daily game slots managed by Sports Managers, plus competitive tournaments and leagues managed by Organizers.

**Recommended delivery expectation**: A stable, secure MVP with payments is more realistically a 2.5–3-month effort for a solo full-stack developer.

</aside>

## 🎯 1. Executive Summary

### Product vision

Enable anyone in Kazakhstan to discover, create, and participate in sports activities—from daily casual games to paid tournaments and leagues.

### Target launch

- **City**: Astana
- **Timeline target**: 1–2 months
- **Product format**: Mobile-first web application with PWA capabilities

### Core value proposition

| Audience | Value delivered |
| --- | --- |
| **Sports Managers / Sports Admins** | Create simple daily game slots, publish the location and time, collect payments through a personal Kaspi link, and manage participant capacity with limited functionality. |
| **Tournament Organizers** | Create competitions, manage rosters and results, and—where legally and technically supported—use escrow and prize payouts. |
| **Participants** | Discover daily games and competitions, see how many people have registered, pay through the correct flow, and join with confidence. |

### Business model

- Charge a commission on paid tournaments and other platform-managed paid events only.
- Free events remain free forever.
- For daily game slots, participants initially pay directly to the Sports Manager through the manager’s personal Kaspi payment link; the platform does not hold these funds in the initial MVP.
- Daily game payments are recorded as participant payment status, not as platform escrow.

### Month 3 success target

- 50+ total participants registered.
- Multiple successful paid events with verified payouts.

---

## 🚀 2. MVP Feature List

### 🔴 2.1 Must-have features — launch blockers

#### User management

- Registration and login using **phone + SMS verification** or **email**.
- User profile containing:
    - Name
    - Phone number
    - Sports played
    - Rating calculated from event participation
- Phone or email verification required before a user can create paid events.

#### Event creation and discovery

The platform supports two primary activity types:

**Daily Game Slot** — a simple, repeatable or one-off game such as tonight’s football, a morning basketball session, or a weekly volleyball game.

**Competition** — a structured tournament or league with organizers, rosters, results, disputes, and optional prize payouts.

Create a **Daily Game Slot** with limited, simple fields:

- Sport type: football, volleyball, basketball, mini-football, or another supported sport.
- Location: free-text location, including a 2GIS link.
- Time: free-text time field, such as “Today, 20:00–22:00”.
- Price: free-text price field, such as “5,000 KZT”.
- Maximum participants.
- Public or private access.
- Sports Manager’s personal Kaspi payment link.

Create a **Competition** with:

- Sport type.
- Date and time.
- Location and map pin.
- Format: tournament or league.
- Maximum participants.
- Age or skill divisions.
- Optional entry fee.
- Prize structure using templates.

Browse activities with filters for:

- Activity type: daily game or competition.
- Sport.
- City.
- Date or “today / this week”.
- Price: free or paid.
- Availability: open, nearly full, full, or completed.

Every activity detail page shows the location, time, price, payment instructions, maximum capacity, and a live count of registered participants, for example **8 / 12 registered**.

Private activities are accessible by invitation link only.

#### Registration and payment

- Participants register for either a Daily Game Slot or a Competition.
- The registration record always shows payment status: **Pending**, **Paid**, **Needs review**, or **Rejected**.
- For Daily Game Slots:
    1. Participant selects **Register**.
    2. Platform displays the Sports Manager’s personal Kaspi payment link and payment instructions.
    3. Participant pays directly to the manager in Kaspi.
    4. Participant submits a payment reference or receipt if required.
    5. The manager confirms the payment manually in the MVP.
- For team competitions, each participant registers individually; the captain assembles the roster later.
- For paid competitions with platform-managed payments:
    1. Redirect the participant to a supported payment provider.
    2. Hold funds in platform escrow only after legal and provider approval.
- Support Kazakhstan payment options such as Kaspi, CloudPayments, Paybox, or an API partner that supports payment status notifications.

#### Event management for tournament organizers

- View registered participants.
- Confirm and manage rosters for team sports.
- Enter results after the event.
- Cancel an event and trigger automatic refunds.

#### Sports Manager / Sports Admin — limited functionality

Sports Managers are a separate, restricted account type for people who run recurring or daily games. They do not receive the full tournament-organizer toolkit.

They can:

- Create a Daily Game Slot.
- Enter location as text, including a 2GIS link.
- Enter time as text.
- Enter price as text.
- Set maximum capacity.
- Add or update their personal Kaspi payment link.
- View the registered participant count and participant list.
- See each registration’s payment status.
- Manually mark a participant as paid, unpaid, or needs review.
- Close, reopen, or cancel their own game slot.

They cannot initially:

- Create tournament brackets or league fixtures.
- Submit competition results or distribute prizes.
- Use platform escrow.
- Access other managers’ participants or payment data.
- Change platform-wide payment settings or commission rules.

#### Results and payouts — competitions only

- Tournament Organizer submits winner placements.
- Participants receive a 48-hour dispute window.
- After the dispute window closes—or immediately if there are no disputes—automatically transfer prizes to winners via Kaspi using their phone number.
- Platform takes its commission; the remaining amount is distributed according to the prize structure.
- Daily Game Slots do not have results, prize pools, or platform payouts in the initial MVP; they only track registration and payment status.

#### Ratings and trust

- Sports Manager and Tournament Organizer ratings based on participant reviews after an activity.
- Participant rating that tracks no-shows and disputes.
- Daily Game Slot reliability signals:
    - Number of completed slots.
    - Cancellation rate.
    - Participant reviews.
    - Payment-confirmation accuracy, where available.
- If a manager or organizer does not show up:
    - Flag the account.
    - Cancel the activity.
    - Apply the appropriate refund or payment resolution flow.
    - Ban the account after repeated or serious violations.

#### Admin dashboard

- View all events: upcoming, active, and completed.
- Monitor payments, manager-confirmed payment statuses, escrow balances, and payouts.
- Review daily-game payment discrepancies and suspicious activity.
- Handle disputes manually.
- Ban or flag users.
- Track platform revenue.

### 🟠 2.2 Should-have features — high priority after launch

- In-app notifications for event reminders, result updates, and payout confirmations.
- Organizer event history and performance statistics.
- Participant event history.
- Event photo uploads after an event.
- Social sharing cards with OpenGraph previews for event links.
- Kazakh language toggle, with Russian as the default language.

### ⚪ 2.3 Later features — post-MVP

- Chat and messaging between organizers and participants.
- Advanced league features:
    - Automatically generated fixtures
    - Live standings tables
    - Playoff brackets
- Persistent team profiles across events.
- Premium organizer accounts.
- Featured event listings and paid promotion.
- Native iOS and Android applications.
- Referee and volunteer role management.
- Live score updates during events.
- Integrations with Strava and fitness trackers.

---

## 🔄 3. User Flows

### 3.1 Flow A — Sports Manager creates a daily game slot

1. Register or sign in and complete the required verification.
2. Apply for or select the **Sports Manager** account type.
3. Select **Create Daily Game Slot**.
4. Enter the simple slot details:
    - **Sport**: Football
    - **Location**: Astana Arena — 2GIS link
    - **Time**: Today, 20:00–22:00
    - **Price**: 5,000 KZT
    - **Capacity**: 12 participants
    - **Kaspi payment link**: Manager’s personal payment link
5. Publish the slot.
6. The activity page shows the price, payment link, capacity, and live count: **0 / 12 registered**.
7. Participants register and pay directly to the manager in Kaspi.
8. The manager reviews payment references or receipts and marks each participant as **Paid**, **Unpaid**, or **Needs review**.
9. The count updates as registrations are created; the slot closes automatically when capacity is reached or manually when the manager closes it.
10. After the game, participants can leave a review for the manager.

### 3.2 Flow B — Organizer creates a paid tournament

1. Register and verify phone or email.
2. Select **Create Event**.
3. Complete the event form:
    - **Sport**: Football
    - **Format**: Tournament — single-day knockout bracket
    - **Date and time**: 15 October 2026, 10:00
    - **Location**: Central Stadium, Astana, with map pin
    - **Maximum participants**: 32
    - **Entry fee**: 5,000 KZT
    - **Prize pool**: 1st place 60%, 2nd place 30%, 3rd place 10% — template suggestion
    - **Age division**: 18–35
4. Submit the event; it goes live and becomes visible in the browse page.
5. Participants register and pay; money accumulates in escrow.
6. On the event day, the organizer checks in participants.
7. After the event, the organizer enters the results:
    - 1st: User123
    - 2nd: User456
    - 3rd: User789
8. The 48-hour dispute window opens.
9. If there are no disputes, the platform automatically pays winners via Kaspi and takes its commission.
10. Participants rate the organizer using 1–5 stars and an optional comment.

### 3.3 Flow C — Participant joins a daily game or paid competition

1. Browse activities and apply filters such as **Football · Astana · Today · Open**.
2. Open an activity and review its location, time, price, capacity, current registered count, and payment instructions.
3. Select **Register**.
4. If it is a Daily Game Slot:
    - Open the Sports Manager’s personal Kaspi payment link.
    - Pay directly to the manager.
    - Submit a payment reference or receipt if requested.
    - Wait for the manager to confirm the payment.
5. If it is a paid Competition:
    - Confirm that the entry fee is held in escrow where that payment model is enabled.
    - Continue to the supported payment provider.
6. After registration:
    - Show the user **Registered — payment pending** until payment is verified.
    - Change the status to **Registered — paid** after confirmation.
7. Participate on the event day.
8. For competitions, view results and receive a Kaspi payout notification if the participant wins.
9. Rate the Sports Manager or Tournament Organizer.

### 3.4 Flow D — Participant disputes a competition result

1. The event is completed and the organizer submits results.
2. The participant sees: **Results posted. Dispute window: 48 hours.**
3. The participant selects **Dispute** and enters a reason, for example: “I placed 2nd, not 3rd.”
4. An admin is notified and manually reviews the case, contacting the organizer and participant.
5. The admin either adjusts the results or rejects the dispute.
6. Payouts execute using the final results.

### 3.5 Flow E — Manager or organizer cancels an activity

1. The Sports Manager or Tournament Organizer selects **Cancel Activity** and confirms.
2. For a Daily Game Slot, the platform marks all registrations for manual payment resolution; automatic refunds are only possible if the payment provider supports them.
3. For a platform-managed paid Competition, the platform immediately refunds all participants through the payment provider API.
4. The manager or organizer account is flagged and becomes visible to admins.
5. If the account shows a pattern of cancellations, the account is banned.

---

## ⚖️ 4. Money Flow and Legal Checklist

### 4.1 Money flow example

```
Participant pays 5,000 KZT
        ↓
Payment provider (Kaspi / CloudPayments)
        ↓
Platform escrow account
        ↓
Event completes and no disputes remain
        ↓
Platform takes commission (example: 10% = 500 KZT)
        ↓
Prize pool: 4,500 KZT distributed as follows
  - 1st place: 2,700 KZT (60%) → Kaspi transfer
  - 2nd place: 1,350 KZT (30%) → Kaspi transfer
  - 3rd place: 450 KZT (10%) → Kaspi transfer
```

### 4.2 Legal checklist — consult a lawyer before launch

> **Important:** This product involves prize money, payments, participant funds, personal data, and potentially regulated financial activity. Obtain legal clearance before enabling paid events.
> 

#### Critical questions for legal counsel

1. **Gambling and lottery law**
    - Could holding prize tournaments be classified as gambling under Kazakhstan law?
    - If an entry fee plus a chance-based outcome is treated as a lottery, it may be illegal.
    - Sports tournaments are skill-based, but this classification must be confirmed.
2. **Licensing**
    - Is a license required to operate a platform that handles prize money?
3. **Tax obligations**
    - Must the platform withhold tax on prize payouts?
    - Are winners responsible for declaring prize income?
    - Must the platform issue tax documents to winners?
4. **Legal entity**
    - Should the business be registered as a **ТОО (LLC)** or **ИП (sole proprietorship)**?
    - Working recommendation: use a ТОО for liability protection, especially when handling escrowed funds.
5. **Contracts and terms**
    - Terms of Service covering organizer responsibilities, refund policy, and dispute process.
    - Privacy Policy covering user data handling and compliance with Kazakhstan data-protection laws.
    - Organizer Agreement covering liability waiver, result accuracy, and cancellation penalties.
6. **Escrow account**
    - Can the platform legally hold participant funds?
    - Is a payment-aggregator license required, or must the platform partner with a licensed entity?
7. **Refund rules**
    - Is the rule “no refund if the participant cancels less than 24 hours before the start” legally enforceable?
8. **Banned and flagged users**
    - What are the legal grounds for banning users?
    - Include fraud, repeated no-shows, and chargebacks in the Terms of Service.

#### Legal action

- Schedule a consultation with a Kazakhstan commercial and technology lawyer as soon as possible.
- Budget approximately **$300–500** for the initial review.

---

## 🧱 5. Tech Stack and Architecture

### 5.1 Recommended stack — fast, modern, and cost-effective

| Layer | Recommendation | Purpose |
| --- | --- | --- |
| **Frontend** | Next.js 14+ | React framework with App Router and Server Components. |
| **UI and styling** | Tailwind CSS | Rapid, mobile-first UI development. |
| **Component library** | shadcn/ui | Pre-built accessible components. |
| **App format** | PWA configuration | Installable app with basic offline capabilities. |
| **Backend** | Next.js API routes | Same codebase with serverless functions. |
| **ORM** | Prisma ORM | Type-safe database access and migrations. |
| **Database** | PostgreSQL | Relational storage for users, events, and transactions. |
| **Authentication** | NextAuth.js | Authentication and phone/email verification flows. |
| **SMS** | Twilio or Kazakhstan-local provider | Examples: [SMSC.kz](http://SMSC.kz) or Beeline SMS Gateway. |
| **Payments** | Kaspi QR/API, CloudPayments, Paybox | Research support for escrow, marketplace, and split-payment models. |
| **International fallback** | Stripe | Use if international cards are needed and the operating model permits it. |
| **Maps** | Google Maps API | Location picker and event map display. |
| **File storage** | Vercel Blob or Cloudflare R2 | Event photos and later media storage. |
| **Hosting** | Vercel | Free tier for MVP and automatic deployments. |
| **Hosting alternative** | Railway | Simpler pay-as-you-go hosting with PostgreSQL available. |
| **Monitoring** | Sentry | Error tracking with a free tier. |
| **Analytics** | Vercel Analytics | Built-in analytics with a free tier. |

### 5.2 Why this stack

- **Single codebase**: Next.js provides both the frontend and backend.
- **Type-safe**: TypeScript throughout, with Prisma for database access.
- **Fast development**: Tailwind and shadcn/ui reduce custom UI work.
- **Low cost**: Vercel free tier plus PostgreSQL on Railway at approximately $5/month.
- **Easy scaling**: Serverless functions and edge caching support future growth.
- **Mobile-first**: Tailwind responsiveness and PWA support simplify mobile delivery.

### 5.3 Architecture

```
┌─────────────────────────────────────────────┐
│              User (Mobile Browser)          │
│            PWA, responsive design           │
└─────────────────┬───────────────────────────┘
                  │
                  ↓
┌─────────────────────────────────────────────┐
│              Next.js App (Vercel)           │
│  ┌───────────────────────────────────────┐  │
│  │ Frontend (React Server Components)   │  │
│  └───────────────────────────────────────┘  │
│  ┌───────────────────────────────────────┐  │
│  │ API Routes (Serverless Functions)    │  │
│  │ - Auth (NextAuth)                    │  │
│  │ - Events CRUD                        │  │
│  │ - Payment webhooks                   │  │
│  │ - Payouts (Kaspi API)                │  │
│  │ - Admin actions                      │  │
│  └───────────────────────────────────────┘  │
└─────────────┬──────────────┬────────────────┘
              │              │
              ↓              ↓
     ┌─────────────┐  ┌──────────────────┐
     │ PostgreSQL  │  │ Payment Provider │
     │ (Railway)   │  │ (Kaspi,         │
     │             │  │ CloudPayments,  │
     │             │  │ etc.)           │
     └─────────────┘  └──────────────────┘
              │
              ↓
     ┌──────────────────────┐
     │ External Services    │
     │ - SMS (Twilio)       │
     │ - Maps (Google)       │
     │ - Monitoring          │
     └──────────────────────┘
```

---

## 🗄️ 6. Database Schema — Key Entities

The following Prisma schema captures the core MVP entities and relationships.

```
model User {
  id             String   @id @default(cuid())
  phone          String   @unique
  email          String?  @unique
  name           String
  verified       Boolean  @default(false)
  rating         Float?   // Calculated from reviews
  createdAt      DateTime @default(now())

  organizedEvents Event[]       @relation("Organizer")
  registrations   Registration[]
  reviews         Review[]
  disputes        Dispute[]
}

model Event {
  id              String   @id @default(cuid())
  organizerId     String
  organizer       User     @relation("Organizer", fields: [organizerId], references: [id])

  sport           String   // football, volleyball, basketball, etc.
  format          String   // tournament, league
  title           String
  description     String?
  location        String
  latitude        Float
  longitude       Float

  startDate       DateTime
  maxParticipants Int
  entryFee        Float    @default(0) // 0 = free event
  prizePool       Json?    // { "1st": 60, "2nd": 30, "3rd": 10 }

  status          String   @default("open") // open, full, completed, cancelled
  isPrivate       Boolean  @default(false)
  inviteCode      String?  @unique

  createdAt       DateTime @default(now())

  registrations   Registration[]
  results         Result[]
  reviews         Review[]
}

model Registration {
  id              String   @id @default(cuid())
  eventId         String
  event           Event    @relation(fields: [eventId], references: [id])
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  status          String   @default("registered") // registered, cancelled, noshow
  paidAmount      Float
  transactionId   String?  // Payment provider reference

  createdAt       DateTime @default(now())

  @@unique([eventId, userId])
}

model Result {
  id              String   @id @default(cuid())
  eventId         String
  event           Event    @relation(fields: [eventId], references: [id])
  userId          String   // Winner/placer
  placement       Int      // 1, 2, 3, etc.
  prizeAmount     Float?
  paidOut         Boolean  @default(false)
  payoutRef       String?  // Kaspi transaction ID

  createdAt       DateTime @default(now())
}

model Review {
  id              String   @id @default(cuid())
  eventId         String
  event           Event    @relation(fields: [eventId], references: [id])
  reviewerId      String
  reviewer        User     @relation(fields: [reviewerId], references: [id])

  rating          Int      // 1-5
  comment         String?

  createdAt       DateTime @default(now())
}

model Dispute {
  id              String   @id @default(cuid())
  eventId         String
  userId          String
  user            User     @relation(fields: [userId], references: [id])

  reason          String
  status          String   @default("open") // open, resolved, rejected
  adminNotes      String?

  createdAt       DateTime @default(now())
}

model Transaction {
  id              String   @id @default(cuid())
  eventId         String
  userId          String?  // Null for platform commission
  type            String   // entry_fee, payout, commission, refund
  amount          Float
  providerRef     String?  // External transaction ID
  status          String   // pending, completed, failed

  createdAt       DateTime @default(now())
}
```

---

## 🗓️ 7. Three-Month Roadmap

### 📍 Month 1 — Core MVP development

#### Weeks 1–2 — Foundation

**Full-stack developer**

- Set up the Next.js project and Vercel deployment pipeline.
- Set up PostgreSQL on Railway and the Prisma schema.
- Implement authentication with NextAuth and phone verification via SMS.
- Build the mobile-responsive user registration and login flow.

**Product / QA**

- Finalize feature wireframes in Figma or on paper.
- Write user stories for the Weeks 3–4 features.

**Legal / Finance**

- Consult a lawyer regarding gambling, licensing, and Terms of Service.
- Research payment-provider APIs, especially Kaspi and CloudPayments.

**Marketing**

- Set up Instagram and Facebook pages.
- Prepare copy for a beta landing page.

#### Weeks 3–4 — Event creation and browsing

**Full-stack developer**

- Build event CRUD: create, read, and filtered list views.
- Integrate a map location picker using Google Maps.
- Build the mobile-first event detail page.
- Add private event invitation links.
- Build the registration flow without payment.

**Product / QA**

- Test event creation.
- Test browse and filter UX on mobile devices.

**Legal / Finance**

- Draft the Terms of Service and Privacy Policy.
- Open the business bank account required for escrow operations.

### 💳 Month 2 — Payments and escrow

#### Weeks 5–6 — Payment integration

**Full-stack developer**

- Integrate 2–3 payment providers, including Kaspi and cards.
- Implement escrow logic and transaction tracking.
- Build payment webhook handlers: confirm payment and update registration.
- Implement the refund API for cancelled events.

**Product / QA**

- Test payment flows with real test transactions.
- Verify escrow accounting.

**Legal / Finance**

- Finalize provider agreements and merchant accounts.
- Set up the payout bank account or Kaspi Business account.

#### Weeks 7–8 — Results and payouts

**Full-stack developer**

- Build the organizer result-submission UI.
- Implement the 48-hour dispute-window logic.
- Implement automatic payout through the Kaspi API, with a manual fallback.
- Calculate commissions and track platform revenue.
- Build the admin dashboard for events, disputes, and user bans.

**Product / QA**

- Run the end-to-end test: paid event → results → payout.
- Test the dispute flow.

**Marketing**

- Recruit 5–10 beta organizers through personal outreach and local sports groups.

### 📈 Month 3 — Polish, launch, and monitoring

#### Weeks 9–10 — Trust and ratings

**Full-stack developer**

- Build organizer and participant rating systems.
- Build the post-event review flow.
- Implement no-show tracking and automatic ban logic.
- Add email/SMS notifications for event reminders and payout confirmations.
- Add the PWA manifest and service worker so the app is installable.

**Product / QA**

- Run UAT with beta organizers.
- Fix critical bugs.

**Legal / Finance**

- Publish the Terms of Service and Privacy Policy on the site.
- Complete the compliance checklist.

#### Weeks 11–12 — Soft launch

**All functions**

- Soft launch with beta organizers and 5–10 events.
- Monitor payment success rate, disputes, and user feedback.
- Run daily check-ins and rapid bug fixes.

**Marketing**

- Promote the first events on Instagram and sports Facebook groups.
- Encourage organizers to share event links.
- Track registrations and the ratio of paid to free events.

**Full-stack developer**

- Optimize performance, including page load and API response times.
- Set up Sentry error monitoring.

#### Week 13 — Iterate

- Analyze the first month of data.
- Implement the top 2–3 user-requested features from the Should Have list.
- Plan the next-quarter roadmap.

---

## 👥 8. Roles and Responsibilities

| Role | Key responsibilities |
| --- | --- |
| **Full-stack developer (President)** | All development, deployment, payment integration, bug fixes, and server monitoring. |
| **Product / QA** | Feature specifications, user testing, UAT, bug tracking, prioritization, and user-feedback analysis. |
| **Legal / Finance** | Lawyer consultation, payment-provider setup, Terms of Service and Privacy Policy, escrow accounting, tax compliance, and dispute-escalation support. |
| **Marketing** | Social media, organizer outreach, event promotion, beta recruitment, content creation, and user-acquisition tracking. |

---

## ⚠️ 9. Main Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
| --- | --- | --- | --- |
| **Payment provider rejects the marketplace or escrow model** | High — paid events cannot launch. | Medium | Research providers early in Week 1. Keep three options. Worst case: use manual bank transfers, which are slower but functional. |
| **Gambling law violation** | Critical — platform could be shut down. | Low–Medium | Obtain legal advice before launch. If unclear, launch with free events only and add paid events after legal clearance. |
| **Organizer fraud, such as a fake event or taking money** | High — user trust is damaged. | Medium | Escrow protects participants through automatic refunds. Verify organizers, use ratings, and manually review the first paid event for each organizer. |
| **Low organizer adoption** | High — no supply means no users. | Medium | Waive commission for the first month. Conduct direct outreach to 10–20 known organizers. Help promote their events. |
| **Payment integration takes too long** | High — launch is delayed. | Medium | Start in Week 1. Use sandbox environments immediately. Use a developer experienced with payments. Budget two full weeks for integration and testing. |
| **No-show participants frustrate organizers** | Medium | High | Use a no-refund policy when participants cancel less than 24 hours before the event. Track no-shows and display a participant reliability score. |
| **Disputes spiral out of control** | Medium — admin workload increases. | Low | Define clear Terms of Service: organizer result entry is binding unless fraud is proven. The 48-hour window limits the dispute timeframe. Most sports have clear outcomes. |
| **The 1–2-month timeline is too aggressive** | Medium — quality may suffer. | High | Realistic assessment: 2.5–3 months is more likely. Cut Should Have features ruthlessly. Launch with football plus one additional sport. Delay ratings to Week 9. Accept manual admin work, such as manual payouts if the API fails. |

---

## 📊 10. Success Metrics — Month 3 Targets

| Metric | Target | Measurement |
| --- | --- | --- |
| **Total registered users** | 50+ | Count rows in the User table. |
| **Events created** | 20+ of any type | Count rows in the Event table. |
| **Paid events** | 5+ | Events where `entryFee > 0` and `status = completed`. |
| **Successful payouts** | 3+ | Results where `paidOut = true`. |
| **Average organizer rating** | 4.0+ / 5.0 | `Avg(Review.rating)`. |
| **Payment success rate** | 95%+ | Completed transactions ÷ attempted transactions. |
| **Dispute rate** | <10% of events | Disputes ÷ completed events. |
| **Platform commission revenue** | 50,000 KZT+ | Sum of `Transaction.amount` where `type = commission`. |

### Leading indicators to track weekly

- New user signups.
- Event creation rate.
- Event registration rate: participants per event.
- Payment drop-off rate: started checkout but did not complete payment.

---

## 🚫 11. MVP Boundaries — Explicitly Not Building

To maintain the 1–2-month target, exclude the following from the MVP:

- ❌ Native mobile apps.
- ❌ In-app chat or messaging.
- ❌ Automatic league fixtures and standings; manage these manually.
- ❌ Persistent team profiles.
- ❌ Live scoring during events.
- ❌ Video uploads.
- ❌ Multilingual support for MVP; use Russian only and add Kazakh post-launch.
- ❌ Advanced analytics for organizers.
- ❌ Referee and volunteer management.
- ❌ Tiered organizer accounts; all organizers receive the same features.
- ❌ Featured event promotion; all events have equal visibility.

---

## 🛠️ 12. Technical Gotchas and Best Practices

### Payment integration

- Test refunds thoroughly; refund handling is one of the most common payment bugs.
- Handle webhook retries with idempotency keys.
- Log every transaction state change to maintain an audit trail.
- Never trust client-side payment confirmation; verify payment server-side.

### Escrow and financial accounting

- Maintain a separate `Transaction` database table for the financial audit trail.
- Reconcile daily using:
    
    **Escrow balance = unpaid results + pending refunds**
    
- Show the real-time escrow balance in the admin dashboard.

### Mobile-first experience

- Test on real devices, including iPhone SE and mid-range Android devices.
- Use thumb-friendly tap targets with a minimum size of 44 px.
- Target page loads under 2 seconds on 3G.
- Make the experience offline-friendly; the PWA service worker should cache the event list.

### Security

- Hash passwords with bcrypt, handled through NextAuth.
- Use HTTPS only; Vercel enforces HTTPS.
- Rate-limit authentication endpoints to prevent brute-force attacks.
- Validate every user input server-side with the Prisma schema and Zod validation.
- Protect admin routes by checking the user role in every API handler.

### Scalability

- Add PostgreSQL indexes on:
    - `Event.startDate`
    - `Event.sport`
    - `Registration.eventId`
    - `User.phone`
- Cache the event list with Vercel edge caching and revalidate every 60 seconds.
- Lazy-load event images using the Next.js Image component.

---

## 🧑‍💻 13. Key User Stories for Development Prioritization

1. **As an organizer, I want to create a paid football tournament so I can collect entry fees and distribute prizes automatically.**
2. **As a participant, I want to browse upcoming events near me so I can find games to join.**
3. **As a participant, I want to pay securely knowing my money is held in escrow so I am protected if the event is cancelled.**
4. **As an organizer, I want to enter results and have winners paid automatically so I do not handle cash.**
5. **As a participant, I want to dispute a result if I believe it is incorrect so I am not cheated.**
6. **As an admin, I want to see all active events and flag fraudulent organizers so the platform stays trustworthy.**
7. **As a participant, I want to see an organizer’s rating before registering so I can avoid unreliable organizers.**

---

## ✅ 14. Final Recommendations

### 14.1 Timeline reality check

- A 1–2-month delivery is very tight for a solo full-stack developer, even with payment experience.
- A realistic estimate for a stable, secure MVP with payments is **2.5–3 months**.
- If a 1–2-month launch is mandatory, cut paid events entirely. Launch with free events, build the audience, and add payments in Month 3.

### 14.2 Biggest risks to address first

1. **Legal clarity on prizes** — resolve in Week 1.
2. **Payment-provider support for escrow** — resolve in Weeks 1–2.
3. **Organizer recruitment** — start in Week 1 and continue throughout development.

### 14.3 Quick wins for traction

- Launch with one popular organizer who already runs events manually; they can bring an initial audience.
- Waive commission for the first 10 paid events.
- Post in Astana sports Facebook groups: “Who organizes football tournaments? We built a tool for you (free beta).”

### 14.4 Technical debt to accept for speed

- Manual payout fallback if the API fails; an admin transfers funds manually.
- No automated tests initially; use manual QA and add tests after launch.
- Russian-only UI; add Kazakh in Month 4.
- Simple rating algorithm using an average; no weighted or decay logic.

### 14.5 When to pivot

- **Fewer than 5 events by Week 12**: organizer acquisition is the problem, not the product. Pause development and focus on outreach.
- **Payment integration blocked by law or provider limitations**: launch free events, build an audience, and add payments later.
- **Disputes exceed 20% of events**: result verification is broken. Add photo proof requirements or a referee role.

---

## 🏁 Immediate Next Steps

1. Show this plan to the team.
2. Adjust the timeline based on the developer’s actual capacity.
3. Schedule the lawyer consultation in Week 1.
4. Start codebase setup with Next.js, Prisma, and Vercel.

<aside>
🚀

**Launch principle**

Validate the legal and payment model first, recruit organizers in parallel, and keep the initial product narrow: football plus one additional sport, mobile-first discovery and registration, escrow-backed payments where legally and technically supported, and manual admin fallbacks where automation would delay launch.

</aside>