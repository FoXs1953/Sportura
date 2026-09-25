# Sportura Hub

MVP Product Brief: Sportura 
Go to /Documents/Sportura folder and do everything in there
Push everything to Github. https://github.com/FoXs1953/Sportura.git , token: @secret:GITHUB_PERSONAL_ACCESS_TOKEN . Push everythin to Sportura repo

1. Product Vision

Build a mobile-first sports platform for Kazakhstan where people can discover and join:

Daily casual sports games.

Recurring game sessions.

Amateur tournaments.

Sports leagues.

Paid competitions with prizes.

The platform should serve both casual players and organized sports communities.

Initial launch

City: Astana

Format: Mobile-first web application / PWA

Target launch: 1–2 months for the first version

Realistic timeline: 2.5–3 months for a stable MVP with payments

Initial sports: Football, mini-football, basketball, volleyball

Default product language: Russian for the MVP

Future language: Kazakh language support after launch

2. Two Operating Models

The platform must support two different types of activities.

2.1 Daily Game Slots

Daily Game Slots are simple casual or recurring games.

Examples:

Football tonight at 20:00.

Basketball every Saturday morning.

Volleyball game with 12 available places.

Casual mini-football game at a local sports center.

Daily Game Slots do not require:

Tournament brackets.

League fixtures.

Standings.

Result submission.

Prize distribution.

Escrow.

Automatic payouts.

They mainly need:

Basic activity information.

Participant registration.

Maximum capacity.

Registered participant count.

Direct payment to the Sports Manager.

Payment status tracking.

2.2 Competitions

Competitions include:

Tournaments.

Leagues.

Knockout brackets.

Prize pools.

Results.

Disputes.

Escrow-based payments where legally and technically supported.

Prize payouts.

Competitions use the more advanced organizer functionality from the original plan.

3. Target Users and Roles

3.1 Participants

Participants can:

Create an account.

Verify their phone or email.

Browse daily games and competitions.

Filter activities by sport, city, date, price, and type.

See the current number of registered participants.

Register for activities.

Pay for activities.

View payment status.

Participate in games and competitions.

View tournament results.

Submit disputes for competition results.

Rate Sports Managers and Tournament Organizers.

Build a participant reliability rating based on attendance and disputes.

3.2 Sports Manager / Sports Admin

A Sports Manager is a person who regularly organizes casual sports games.

This is a limited account type. Sports Managers do not receive the full tournament-organizer functionality.

Sports Managers can:

Create a Daily Game Slot.

Select the sport.

Enter location as text.

Add a 2GIS link.

Enter time as text.

Enter price as text.

Set maximum participants.

Add a personal Kaspi payment link.

Publish the game slot.

View registered participants.

See the current participant count.

See the payment status of each participant.

Manually mark participants as paid, unpaid, or needing review.

Close, reopen, or cancel their own game slots.

Review participant information related to their own games.

Receive participant ratings and reviews.

Sports Managers cannot initially:

Create tournament brackets.

Create league fixtures.

Submit tournament results.

Manage prize pools.

Distribute prizes.

Use platform escrow.

Access other managers’ participants.

Change platform-wide payment settings.

Change commission rules.

Manage other users’ activities.

Create advanced team structures.

Sports Managers may require approval by the platform admin before creating paid game slots.

3.3 Tournament Organizers

Tournament Organizers can:

Create tournaments and leagues.

Define the sport, date, time, and location.

Configure participant limits.

Configure divisions by age or skill.

Set entry fees.

Create prize structures.

Manage registered participants.

Manage team rosters.

Enter results.

Open a dispute window.

Cancel competitions.

Process refunds where supported.

Receive ratings from participants.

3.4 Platform Admins

Platform Admins can:

View all users.

Approve or reject Sports Manager accounts.

View all Daily Game Slots and Competitions.

Monitor registrations.

Monitor payment statuses.

Review suspicious payment activity.

Handle disputes.

Flag or ban users.

Review cancellations.

View escrow balances.

Monitor platform revenue.

Manage commissions.

Review manual payment confirmations.

Investigate failed webhooks.

View payment audit logs.

Manage platform-wide settings.

4. Product Value Proposition

For Participants

Find casual games and competitions in one place.

See how many places are already taken.

Discover games near them.

See transparent price and location information.

Open locations directly in 2GIS.

Pay through the correct payment flow.

Know whether their payment is confirmed.

Build trust through ratings and reviews.

For Sports Managers

Quickly create a game slot.

Avoid managing registrations manually in chats.

Publish a personal Kaspi payment link.

See the participant list in one place.

Track who has paid.

Track remaining places.

Reuse the same process for daily or recurring games.

Build a reputation through participant reviews.

For Tournament Organizers

Create tournaments and leagues.

Collect entry fees.

Manage rosters.

Submit results.

Reduce cash handling.

Use escrow and automated prize payouts where supported.

For the Platform

Build a database of sports activities and players.

Generate revenue from platform-managed paid competitions.

Increase engagement through frequent daily games.

Build a reliable reputation system.

Start with simple manual workflows and automate them later.

5. Business Model

Free events remain free forever.

The platform charges a commission on platform-managed paid competitions.

The platform may later charge a commission or subscription fee for Sports Managers, but this is not required for the initial MVP.

For Daily Game Slots, participants initially pay directly to the Sports Manager through the manager’s personal Kaspi payment link.

The platform does not hold Daily Game Slot payments in escrow during the initial MVP.

The platform records payment status but does not automatically distribute Daily Game Slot money.

Tournament payments may use platform escrow only after legal and payment-provider approval.

The first 10 paid competitions may be commission-free to encourage organizer adoption.

6. MVP Features

6.1 User Management

Registration and login.

Phone and SMS verification or email verification.

User profile.

Name.

Phone number.

Email.

Sports played.

Profile photo, optional for MVP.

User role.

Participant rating.

Organizer or Sports Manager rating.

No-show history.

Dispute history.

Account status: active, flagged, suspended, or banned.

Phone or email verification is required before a user can:

Create paid competitions.

Apply to become a Sports Manager.

Add a payment link.

Receive payouts.

6.2 Daily Game Slot Creation

A Sports Manager creates a game slot using a simple form.

Required fields:

Sport.

Location text.

2GIS link.

Time text.

Price text.

Maximum number of participants.

Personal Kaspi payment link.

Optional fields:

Short description.

Public or private visibility.

Skill level.

Age range.

Equipment requirements.

Cancellation policy.

Notes for participants.

Recurrence information, such as weekly or daily.

Example:

Sport: Football

Location: Astana Arena

2GIS link: Link to the location in 2GIS

Time: Today, 20:00–22:00

Price: 5,000 KZT

Maximum participants: 12

Kaspi payment link: Sports Manager’s personal link

The activity page should show:

Sport.

Location.

2GIS link.

Time.

Price.

Sports Manager name.

Sports Manager rating.

Maximum capacity.

Current registration count.

Remaining places.

Payment instructions.

Kaspi payment link.

Registration button.

Cancellation rules.

Example participant count:

8 / 12 registered

The slot should automatically become full when capacity is reached.

6.3 Competition Creation

Tournament Organizers can create:

Football tournaments.

Mini-football tournaments.

Basketball tournaments.

Volleyball tournaments.

Leagues.

Single-day knockout tournaments.

Future playoff formats.

Competition fields:

Title.

Description.

Sport.

Format.

Date.

Time.

Location.

Map pin.

Maximum participants.

Age division.

Skill division.

Entry fee.

Prize structure.

Public or private access.

Invite-only link.

Registration deadline.

Cancellation policy.

Prize templates:

1st place: 60%.

2nd place: 30%.

3rd place: 10%.

6.4 Activity Discovery

Participants can browse all activities.

Filters:

Activity type:

Daily Game Slot.

Tournament.

League.

Sport.

City.

Date.

Today.

This week.

Weekend.

Price.

Free.

Paid.

Availability:

Open.

Nearly full.

Full.

Completed.

Cancelled.

Skill level.

Age division.

Distance or location.

Activity cards should show:

Sport.

Title.

Date or time.

Location.

Price.

Activity type.

Manager or organizer.

Registered count.

Maximum capacity.

Rating.

Registration status.

6.5 Registration

Participants can register for:

Daily Game Slots.

Tournaments.

Leagues.

For team sports:

Each participant registers individually.

The captain assembles the roster later.

Team management remains simple in the MVP.

Persistent team profiles are not required initially.

Registration statuses:

Registered.

Payment pending.

Paid.

Needs review.

Rejected.

Cancelled.

No-show.

6.6 Payment Flow for Daily Game Slots

For the MVP:

Participant opens a Daily Game Slot.

Participant reviews the location, time, price, capacity, and current registered count.

Participant selects Register.

The platform creates a registration with status Payment pending.

The platform displays the Sports Manager’s personal Kaspi payment link.

Participant pays directly to the Sports Manager.

Participant may submit:

Payment reference.

Transaction number.

Screenshot or receipt.

Sports Manager checks the payment manually.

Sports Manager changes the status to:

Paid.

Needs review.

Rejected.

Participant receives confirmation.

Registered count remains visible and updates immediately after registration.

The game becomes full after reaching maximum capacity.

The platform should clearly state:

Payment is made directly to the Sports Manager through Kaspi. The platform does not hold the money in escrow for Daily Game Slots during the initial MVP.

6.7 Payment Flow for Competitions

For paid competitions:

Participant selects Register.

The platform displays the entry fee and payment terms.

Participant is redirected to the supported payment provider.

Payment is verified through the provider API or webhook.

Money is held according to the approved payment model.

Registration becomes Paid.

The participant receives confirmation.

After the competition:

Results are submitted.

The dispute window opens.

Payouts execute after the dispute period.

The platform takes its commission.

Winners receive their prize payout.

6.8 Sports Manager Dashboard

The dashboard should be intentionally simple.

Main sections:

My Game Slots.

Create Game Slot.

Upcoming Games.

Participant List.

Payment Status.

Game Slot Status.

Reviews.

Profile.

Kaspi Payment Link.

For every game slot, display:

Total capacity.

Registered participants.

Paid participants.

Pending payments.

Participants needing review.

Remaining places.

Cancellation status.

Example:

Status Count Registered 12 Paid 9 Payment pending 2 Needs review 1 Remaining places 0

6.9 Tournament Organizer Dashboard

The organizer dashboard should include:

Create Competition.

Upcoming Competitions.

Registered Participants.

Team Rosters.

Entry Payments.

Event Check-in.

Submit Results.

Disputes.

Refunds.

Reviews.

Revenue and prize information.

6.10 Admin Dashboard

Admin capabilities:

View all users.

Approve Sports Managers.

Review all activities.

Review all registrations.

See Daily Game Slot payment statuses.

Review manual payment changes.

Review payment references and receipts.

Investigate suspicious activity.

Handle participant complaints.

Handle competition disputes.

Cancel activities.

Process refunds where supported.

Ban or flag accounts.

View platform commissions.

Monitor escrow balances.

View payout status.

View webhook events and errors.

7. Kaspi Payment Automation

Payment automation should be investigated before development begins.

The main question is whether a personal Kaspi payment link can provide:

Payment status.

Transaction ID.

Webhook notifications.

Payment confirmation.

Refund capability.

API access.

QR payment status.

Invoice status.

Merchant reporting.

Do not assume that a standard personal Kaspi payment link supports webhooks.

The product must distinguish between:

Personal Kaspi payment links.

Kaspi Pay business or merchant accounts.

Third-party providers that connect Kaspi Pay to APIs and webhooks.

Possible future automation:

Each Sports Manager connects an approved merchant account.

The platform creates a unique invoice or payment reference.

The participant pays through Kaspi.

Kaspi or the provider sends a webhook.

The platform receives the payment event.

The platform matches the payment to the registration.

The registration changes automatically from Payment pending to Paid.

Duplicate webhook events are ignored.

Webhook signatures are verified.

Failed webhook deliveries are retried.

Every payment event is recorded in an audit log.

If direct personal links cannot support this, the MVP should use:

Manual confirmation.

Participant payment reference.

Optional receipt upload.

Manager approval.

Admin review for suspicious cases.

Payment status history.

Manual reconciliation.

Potential third-party payment infrastructure may provide:

Kaspi Pay invoice creation.

Payment status polling.

Webhooks.

HMAC signatures.

Retry logic.

QR payment support.

Refund endpoints.

Merchant dashboards.

However, the exact legal, commercial, and technical availability must be verified with Kaspi Business or the selected provider.

8. User Flows

Flow A: Sports Manager Creates a Daily Game Slot

User registers or signs in.

User verifies their phone or email.

User applies for or receives the Sports Manager role.

User selects Create Daily Game Slot.

User enters:

Sport.

Location text.

2GIS link.

Time text.

Price text.

Maximum participants.

Kaspi payment link.

User publishes the slot.

The activity page displays:

0 / 12 registered.

Price.

Location.

Time.

Payment link.

Participants register.

Participants pay directly through Kaspi.

Sports Manager checks payment references.

Sports Manager confirms participants manually.

Payment statuses are updated.

The slot closes when capacity is reached.

Participants attend the game.

Participants can leave reviews.

Flow B: Participant Joins a Daily Game Slot

Participant browses activities.

Participant filters by football, Astana, today, and open.

Participant opens a Daily Game Slot.

Participant sees:

Location.

2GIS link.

Time.

Price.

Manager.

Manager rating.

Current participant count.

Participant selects Register.

The platform creates a pending registration.

Participant opens the Sports Manager’s Kaspi link.

Participant pays directly to the manager.

Participant submits a payment reference if required.

Manager confirms payment.

Registration changes to Paid.

Participant receives confirmation.

Participant attends the game.

Flow C: Organizer Creates a Paid Tournament

Organizer registers.

Organizer verifies phone or email.

Organizer selects Create Competition.

Organizer enters:

Sport.

Format.

Date and time.

Location.

Maximum participants.

Entry fee.

Prize structure.

Age division.

Organizer publishes the competition.

Participants register.

Participants pay through the supported provider.

Money is handled according to the approved escrow model.

Organizer checks in participants.

Organizer enters results.

The 48-hour dispute period opens.

If no dispute is approved, payouts execute.

Participants rate the organizer.

Flow D: Participant Joins a Paid Competition

Participant filters for paid competitions.

Participant opens a competition.

Participant reviews the price, location, date, prize pool, and participant count.

Participant selects Register.

Participant confirms the payment terms.

Participant pays through the supported payment provider.

The platform verifies payment.

Registration changes to Paid.

Participant attends.

Results are published.

Participant can dispute the result during the 48-hour window.

Winners receive payouts after the dispute period.

Flow E: Participant Disputes a Competition Result

Organizer submits results.

Participant sees that results have been posted.

The 48-hour dispute window begins.

Participant selects Dispute.

Participant provides a reason.

Admin receives a notification.

Admin reviews evidence.

Admin contacts the organizer or participant if necessary.

Admin adjusts or rejects the dispute.

Final results are confirmed.

Payouts use the final results.

Flow F: Sports Manager Cancels a Daily Game

Sports Manager selects Cancel Game Slot.

Platform asks for confirmation.

Game slot status changes to Cancelled.

Participants are notified.

Payment statuses are marked for resolution.

Refunds depend on the payment method:

Direct Kaspi payment: manual resolution initially.

Platform-managed provider payment: automatic refund if supported.

Cancellation is recorded on the manager’s profile.

Repeated cancellations may result in restrictions or a ban.

9. Money Flow

9.1 Daily Game Slot

Participant registers
        ↓
Platform shows Sports Manager’s personal Kaspi link
        ↓
Participant pays directly to Sports Manager
        ↓
Participant submits payment reference or receipt
        ↓
Sports Manager confirms payment manually
        ↓
Registration status becomes Paid
        ↓
Participant joins the game


The platform does not hold or distribute the money in the initial MVP.

9.2 Paid Tournament

Participant pays 5,000 KZT
        ↓
Supported payment provider
        ↓
Platform-managed payment or escrow account
        ↓
Competition is completed
        ↓
Results are submitted
        ↓
48-hour dispute window
        ↓
Platform takes commission
        ↓
Remaining prize pool is distributed


Example:

Participant pays 5,000 KZT

Platform commission: 10% = 500 KZT

Prize pool: 4,500 KZT

1st place: 2,700 KZT
2nd place: 1,350 KZT
3rd place: 450 KZT


10. Legal and Compliance Checklist

Consult a Kazakhstan commercial and technology lawyer before enabling paid competitions.

Gambling and lottery law

Does an entry fee plus a prize classify the activity as gambling?

Does a skill-based sports competition receive different treatment?

Could any prize structure be considered a lottery?

Are Daily Game Slots legally different from prize tournaments?

Licensing

Is a license required to handle participant funds?

Is a payment-aggregator license required?

Can the platform operate through a licensed payment provider?

Can personal Kaspi payment links be used commercially?

Tax obligations

Must the platform withhold tax on prizes?

Are winners responsible for declaring income?

Must the platform issue tax documents?

Are Sports Managers required to report income received through personal Kaspi links?

Legal entity

Consider whether the platform should operate as:

ТОО / LLC.

ИП / sole proprietorship.

A ТОО may provide better liability protection, especially for payment and escrow operations.

Required agreements

Terms of Service.

Privacy Policy.

Participant Agreement.

Sports Manager Agreement.

Tournament Organizer Agreement.

Refund Policy.

Dispute Policy.

Payment and cancellation rules.

Rules for banned users.

Rules for direct payments to Sports Managers.

Important legal distinction

Daily Game Slot payments go directly to Sports Managers in the initial MVP. The platform should clearly explain:

The platform is facilitating discovery and registration.

The payment is made directly to the Sports Manager.

The platform does not hold the money.

The Sports Manager is responsible for confirming payment.

Refunds may require manual resolution until a payment integration is available.

11. Recommended Tech Stack

Frontend

Next.js 14+.

React.

App Router.

Server Components.

TypeScript.

Tailwind CSS.

shadcn/ui.

PWA support.

Responsive mobile-first design.

Backend

Next.js API routes.

Serverless functions.

Prisma ORM.

PostgreSQL.

Zod validation.

Role-based access control.

Authentication

NextAuth.js or equivalent.

Phone verification.

Email verification.

SMS provider such as Twilio or a Kazakhstan-local provider.

Potential providers:

SMSC.kz.

Beeline SMS Gateway.

Other local SMS providers.

Payments

For Daily Game Slots:

Personal Kaspi payment links in the initial MVP.

Manual payment confirmation.

Payment reference or receipt submission.

For Competitions:

Kaspi Pay Business/API if available.

CloudPayments.

Paybox.

Other Kazakhstan payment providers.

Stripe only if international cards are needed and legally supported.

Maps and locations

2GIS links for Daily Game Slots.

Google Maps API for structured competitions and map pins.

Location text should remain supported even when no geocoding is available.

File storage

Vercel Blob.

Cloudflare R2.

Future event photos and receipt uploads.

Hosting

Vercel.

Railway as an alternative.

PostgreSQL on Railway may cost approximately $5/month at MVP scale.

Monitoring

Sentry.

Vercel Analytics.

Payment audit logs.

Webhook delivery logs.

Error tracking.

12. Architecture

┌──────────────────────────────────────────────┐
│           Participant / Manager / Organizer  │
│              Mobile Browser / PWA            │
└─────────────────────┬────────────────────────┘
                      │
                      ↓
┌──────────────────────────────────────────────┐
│              Next.js Application              │
│                    Vercel                    │
│                                              │
│  Frontend                                    │
│  - Activity discovery                        │
│  - Daily Game Slots                          │
│  - Competition pages                         │
│  - Registration                              │
│  - Manager dashboard                         │
│  - Organizer dashboard                       │
│  - Admin dashboard                           │
│                                              │
│  API Routes                                  │
│  - Authentication                            │
│  - User roles                                │
│  - Activity CRUD                             │
│  - Registration                              │
│  - Payment status                            │
│  - Kaspi integration                         │
│  - Webhooks                                  │
│  - Competition results                       │
│  - Disputes                                  │
│  - Admin actions                             │
└──────────────┬─────────────────┬─────────────┘
               │                 │
               ↓                 ↓
       ┌──────────────┐  ┌────────────────────┐
       │ PostgreSQL   │  │ Payment Providers  │
       │              │  │                    │
       │ Users        │  │ Kaspi              │
       │ Activities   │  │ CloudPayments      │
       │ Registrations│  │ Paybox             │
       │ Payments     │  │ API partners       │
       │ Results      │  └────────────────────┘
       │ Disputes     │
       │ Reviews      │
       └──────────────┘
               │
               ↓
       ┌──────────────────────┐
       │ External Services    │
       │ - SMS                 │
       │ - 2GIS links         │
       │ - Google Maps         │
       │ - Sentry              │
       │ - Email notifications │
       └──────────────────────┘


13. Database Schema

The database should support both Daily Game Slots and Competitions.

enum UserRole {
  PARTICIPANT
  SPORTS_MANAGER
  TOURNAMENT_ORGANIZER
  ADMIN
}

enum ActivityType {
  DAILY_GAME
  TOURNAMENT
  LEAGUE
}

enum ActivityStatus {
  OPEN
  NEARLY_FULL
  FULL
  COMPLETED
  CANCELLED
}

enum PaymentStatus {
  PENDING
  PAID
  NEEDS_REVIEW
  REJECTED
  REFUNDED
}

model User {
  id                    String   @id @default(cuid())
  phone                 String   @unique
  email                 String?  @unique
  name                  String
  verified              Boolean  @default(false)
  role                  UserRole @default(PARTICIPANT)
  rating                Float?
  kaspiPaymentLink      String?
  sports                String[]
  createdAt             DateTime @default(now())

  managedActivities     Activity[] @relation("SportsManager")
  organizedActivities   Activity[] @relation("TournamentOrganizer")
  registrations         Registration[]
  reviewsGiven          Review[] @relation("Reviewer")
  reviewsReceived       Review[] @relation("ReviewedUser")
  disputes              Dispute[]
}

model Activity {
  id                    String         @id @default(cuid())
  title                 String
  description           String?
  type                  ActivityType
  status                ActivityStatus @default(OPEN)

  managerId             String?
  manager               User?          @relation("SportsManager", fields: [managerId], references: [id])

  organizerId           String?
  organizer             User?          @relation("TournamentOrganizer", fields: [organizerId], references: [id])

  sport                 String

  locationText          String
  twoGisUrl             String?
  latitude              Float?
  longitude             Float?

  dateTime              DateTime?
  timeText              String?
  priceText             String?
  entryFee              Float?

  maxParticipants       Int
  isPrivate             Boolean        @default(false)
  inviteCode            String?        @unique

  kaspiPaymentLink      String?
  paymentMode           String         @default("MANAGER_DIRECT")

  prizePool             Json?
  format                String?
  ageDivision           String?
  skillDivision         String?

  createdAt             DateTime       @default(now())
  updatedAt             DateTime       @updatedAt

  registrations         Registration[]
  results               Result[]
  disputes              Dispute[]
  reviews               Review[]
}

model Registration {
  id                    String        @id @default(cuid())
  activityId            String
  activity              Activity      @relation(fields: [activityId], references: [id])

  userId                String
  user                  User          @relation(fields: [userId], references: [id])

  status                String        @default("registered")
  paymentStatus         PaymentStatus @default(PENDING)
  paymentReference      String?
  receiptUrl            String?
  paidAt                DateTime?
  confirmedAt           DateTime?
  confirmedById         String?

  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  @@unique([activityId, userId])
}

model Result {
  id                    String   @id @default(cuid())
  activityId            String
  activity              Activity @relation(fields: [activityId], references: [id])

  userId                String
  placement              Int
  prizeAmount           Float?
  paidOut               Boolean  @default(false)
  payoutReference       String?

  createdAt             DateTime @default(now())
}

model Review {
  id                    String   @id @default(cuid())
  activityId            String
  activity              Activity @relation(fields: [activityId], references: [id])

  reviewerId             String
  reviewer              User     @relation("Reviewer", fields: [reviewerId], references: [id])

  reviewedUserId         String
  reviewedUser           User     @relation("ReviewedUser", fields: [reviewedUserId], references: [id])

  rating                 Int
  comment                String?

  createdAt              DateTime @default(now())
}

model Dispute {
  id                    String   @id @default(cuid())
  activityId            String
  activity              Activity @relation(fields: [activityId], references: [id])

  userId                String
  user                  User     @relation(fields: [userId], references: [id])

  reason                String
  status                String   @default("OPEN")
  adminNotes            String?

  createdAt             DateTime @default(now())
}

model PaymentEvent {
  id                    String   @id @default(cuid())
  registrationId        String?
  provider              String
  externalEventId       String?
  externalPaymentId     String?
  eventType             String
  payload               Json
  signatureValid        Boolean?
  processed             Boolean  @default(false)
  processingError       String?

  createdAt             DateTime @default(now())

  @@index([externalEventId])
  @@index([externalPaymentId])
}

model Transaction {
  id                    String   @id @default(cuid())
  activityId            String
  userId                String?
  type                  String
  amount                Float
  providerReference     String?
  status                String

  createdAt             DateTime @default(now())
}


14. Three-Month Roadmap

Month 1: Foundation and activity discovery

Weeks 1–2: Foundation

Development:

Set up Next.js.

Set up Vercel deployment.

Set up PostgreSQL.

Create Prisma schema.

Implement authentication.

Implement user roles.

Implement phone or email verification.

Create basic user profiles.

Create Sports Manager approval logic.

Product and QA:

Finalize wireframes.

Design participant flow.

Design Sports Manager dashboard.

Design Competition Organizer dashboard.

Write user stories.

Define payment-status rules.

Legal and Finance:

Consult a Kazakhstan lawyer.

Research Kaspi payment links.

Research Kaspi Pay Business/API.

Confirm whether direct personal payment links are commercially permitted.

Draft Terms of Service and Privacy Policy.

Marketing:

Create Instagram and Facebook pages.

Prepare a beta landing page.

Identify local sports communities.

Recruit initial Sports Managers.

Weeks 3–4: Activity creation and discovery

Development:

Build Daily Game Slot creation.

Add text location.

Add 2GIS links.

Add text time field.

Add text price field.

Add capacity.

Add participant count.

Add personal Kaspi payment link.

Build Competition creation.

Add activity discovery.

Add filters.

Add activity detail pages.

Add private invite links.

Build registration without automated payments.

Build Sports Manager dashboard.

Build manual payment status flow.

QA:

Test Daily Game Slot creation.

Test participant registration.

Test capacity limits.

Test registered participant count.

Test 2GIS links.

Test payment statuses.

Test manager permissions.

Test mobile UX.

Month 2: Payments and competition management

Weeks 5–6: Payment integration

Development:

Implement manual payment confirmation for Daily Game Slots.

Add receipt or payment-reference submission.

Create payment audit logs.

Research official Kaspi Business/API options.

Test provider APIs.

Test webhook delivery.

Add webhook signature verification.

Add webhook retries.

Integrate platform payment provider for competitions.

Implement registration payment statuses.

Implement refund API where supported.

Legal and Finance:

Finalize payment-provider agreements.

Confirm whether escrow is allowed.

Confirm tax obligations.

Confirm rules for personal Kaspi links.

Set up business bank accounts where necessary.

QA:

Test pending, paid, rejected, and needs-review statuses.

Test duplicate webhooks.

Test failed webhook retries.

Test refunds.

Test payment reconciliation.

Weeks 7–8: Results, disputes, and admin

Development:

Build competition result submission.

Build 48-hour dispute window.

Build competition payout flow.

Build manual payout fallback.

Build commission calculation.

Build admin payment dashboard.

Build Daily Game Slot payment discrepancy review.

Build user flagging and banning.

Build cancellation flows.

Add notifications.

Marketing:

Recruit 5–10 beta Sports Managers.

Recruit tournament organizers.

Launch test games in Astana.

Collect participant feedback.

Month 3: Trust, testing, and launch

Weeks 9–10: Trust and ratings

Development:

Build manager ratings.

Build organizer ratings.

Build participant reliability score.

Build no-show tracking.

Build cancellation tracking.

Add event reminders.

Add payout notifications.

Add PWA manifest.

Add service worker.

Improve activity discovery.

QA:

User acceptance testing.

Test with real Sports Managers.

Test with real participants.

Fix critical bugs.

Test payment reconciliation.

Legal and Finance:

Publish Terms of Service.

Publish Privacy Policy.

Finalize cancellation policy.

Finalize payment disclaimers.

Complete compliance checklist.

Weeks 11–12: Soft launch

Launch with 5–10 Sports Managers.

Launch 5–10 daily game slots.

Launch several test competitions.

Monitor registration conversion.

Monitor payment confirmation.

Monitor cancellations.

Monitor disputes.

Run daily check-ins.

Fix critical issues quickly.

Promote games in Instagram, Facebook, WhatsApp, and local sports communities.

Week 13: Iterate

Analyze the first month of data.

Implement the top 2–3 requested improvements.

Decide whether to automate Kaspi payment confirmation.

Decide whether Sports Managers need subscriptions or commission.

Plan the next-quarter roadmap.

15. Roles and Responsibilities

Role Responsibilities Full-stack Developer / President Development, deployment, database, payment integration, webhooks, security, bug fixes, and monitoring. Product / QA Requirements, wireframes, testing, UAT, bug tracking, prioritization, and feedback analysis. Legal / Finance Legal consultation, payment-provider agreements, taxes, payment rules, contracts, escrow, and disputes. Marketing Social media, Sports Manager recruitment, organizer outreach, activity promotion, and user acquisition. Sports Manager / Sports Admin Creates and manages daily game slots, maintains payment statuses, communicates activity details, and attends the games. Tournament Organizer Creates competitions, manages participants, submits results, and handles tournament operations. Platform Admin Approves managers, monitors activities, manages disputes, reviews payments, and bans users.

16. Main Risks and Mitigation

Risk Impact Likelihood Mitigation Personal Kaspi links do not support APIs or webhooks High High Use manual payment confirmation in MVP. Research Kaspi Business/API and approved providers for Phase 2. Payment provider rejects the escrow or marketplace model High Medium Research providers early. Maintain multiple provider options. Launch daily games with direct manager payments if necessary. Incorrect manual payment confirmation High Medium Store payment references, receipts, confirmation history, and admin audit logs. Sports Manager receives money but cancels the game High Medium Clear terms, manager ratings, account flags, manual refund process, and repeated-cancellation bans. Gambling or lottery classification Critical Low–Medium Consult a Kazakhstan lawyer before paid competitions. Launch with free games if legal status is unclear. Low Sports Manager adoption High Medium Recruit managers directly, waive fees initially, and help them promote their games. Low participant adoption High Medium Start with known sports communities and managers who already have participants. Payment automation takes too long High Medium Use manual confirmation first. Treat automated webhooks as a later milestone. No-show participants Medium High Track reliability, use cancellation rules, and show participant history. Sports Manager cancellation Medium–High Medium Track cancellations, notify participants, and flag repeated cancellations. Disputes become difficult to manage Medium Low Use clear policies and a limited dispute period for competitions. Timeline is too aggressive Medium High Keep Daily Game Slots simple. Delay advanced tournament and automation features. Direct payments create legal or tax risk High Medium Obtain legal advice and clearly define the platform’s role. Fake receipts or payment references Medium Medium Allow admin review, use provider APIs when available, and store all audit data.

17. Success Metrics

Month 3 targets

Metric Target Registered users 50+ Sports Managers approved 5+ Daily Game Slots created 15+ Competitions created 20+ total activities Completed Daily Game Slots 10+ Completed paid competitions 5+ Successful competition payouts 3+ Average Sports Manager rating 4.0+ / 5.0 Average Organizer rating 4.0+ / 5.0 Payment confirmation rate 95%+ Dispute rate Less than 10% of competitions Daily game cancellation rate Less than 15% Platform commission revenue 50,000 KZT+ Registered participants 50+

Weekly leading indicators

New user signups.

New Sports Manager applications.

Approved Sports Managers.

Daily Game Slots created.

Participants per game.

Registration conversion rate.

Average time to fill a game.

Payment confirmation time.

Number of pending payments.

Payment drop-off rate.

Cancellation rate.

No-show rate.

Repeat participant rate.

Repeat Sports Manager rate.

18. MVP Boundaries

Do not build these features in the initial MVP:

Native iOS application.

Native Android application.

In-app chat.

Advanced messaging.

Automatic league fixtures.

Automatic standings.

Playoff brackets beyond basic tournament support.

Persistent team profiles.

Live score updates.

Video uploads.

Advanced organizer analytics.

Referee management.

Volunteer management.

Strava integrations.

Fitness tracker integrations.

Premium organizer accounts.

Featured event promotion.

Complex subscription plans.

Advanced recurring-event automation.

Full automatic Kaspi automation without verified provider support.

Automatic refunds for personal Kaspi payments.

Automatic prize payout without legal and provider approval.

Advanced fraud detection.

19. Technical Best Practices

Payment security

Never trust client-side payment confirmation.

Verify payment server-side when an API is available.

Use idempotency keys.

Handle duplicate webhooks.

Verify webhook signatures.

Retry failed webhook deliveries.

Log every payment state change.

Store provider references.

Store payment event payloads.

Prevent users from editing payment status themselves.

Require manager or admin permission for manual confirmation.

Daily Game Slot payment tracking

Every manual payment status change should store:

Previous status.

New status.

User who made the change.

Date and time.

Payment reference.

Optional note.

Receipt or evidence.

Manager or admin identity.

Escrow accounting

For platform-managed competitions:

Escrow balance =
unpaid prize obligations
+
pending refunds
+
pending payment settlements


Daily reconciliation should compare:

Payment provider balance.

Database transactions.

Registration payment statuses.

Prize payout obligations.

Refund obligations.

Mobile-first experience

Test on iPhone SE.

Test on mid-range Android devices.

Use tap targets of at least 44 px.

Target page loads below 2 seconds on 3G.

Make registration fast.

Make the Kaspi payment link clearly visible.

Show payment status clearly.

Show participant capacity prominently.

Cache activity listings with PWA support.

Security

Use HTTPS.

Hash passwords with bcrypt or a secure authentication provider.

Rate-limit authentication.

Rate-limit registration and payment endpoints.

Validate all inputs with Zod.

Use role-based authorization.

Protect admin routes.

Prevent unauthorized access to manager data.

Protect receipt uploads.

Store personal information securely.

Scalability

Create indexes on:

Activity type.

Activity status.

Activity sport.

Activity date.

Activity location.

Registration activity ID.

Registration user ID.

Registration payment status.

User phone.

Payment provider reference.

20. Key User Stories

As a participant, I want to browse daily sports games near me so I can quickly find something to join.

As a participant, I want to see how many people have registered so I know whether the game is active.

As a participant, I want to open the location in 2GIS so I can easily find the venue.

As a participant, I want to pay through the Sports Manager’s Kaspi link and see whether my payment was confirmed.

As a participant, I want to join a paid tournament through a secure payment flow.

As a Sports Manager, I want to create a simple game slot in less than one minute.

As a Sports Manager, I want to enter the location, time, price, capacity, and Kaspi link without completing a complex tournament form.

As a Sports Manager, I want to see who registered and who paid.

As a Sports Manager, I want to manually confirm payments during the MVP.

As a Sports Manager, I want to close my game when it is full.

As a Sports Manager, I want to receive ratings so participants can trust me.

As a Tournament Organizer, I want to create a paid competition.

As a Tournament Organizer, I want to manage rosters and participants.

As a Tournament Organizer, I want to submit competition results.

As a participant, I want to dispute a competition result if it is incorrect.

As an admin, I want to approve Sports Managers.

As an admin, I want to review suspicious payment confirmations.

As an admin, I want to see all active activities.

As an admin, I want to ban fraudulent managers or organizers.

As the platform owner, I want to automate Kaspi payment confirmation when an approved API or webhook integration is available.

21. Final Recommendations

The platform should not be positioned only as a tournament platform.

The main product should be a sports activity marketplace with two layers:

Daily Game Slots for frequent, simple, casual games.

Competitions for tournaments and leagues.

Daily games are important because they can create much more frequent activity than tournaments. They can also help build the user base before complex payment and prize functionality is fully ready.

The initial Daily Game Slot flow should remain simple:

Create a slot.

Add location and 2GIS link.

Add time.

Add price.

Add capacity.

Add personal Kaspi link.

Display registered count.

Manually confirm payments.

Do not delay the launch while trying to automate personal Kaspi payments.

Start with manual payment confirmation and build the database structure so automation can be added later.

The first priorities should be:

Validate whether Sports Managers are willing to use the platform.

Recruit 5–10 Sports Managers in Astana.

Launch daily football and basketball games.

Test participant registration.

Test manual payment confirmation.

Investigate Kaspi Business/API and webhook options.

Confirm legal requirements.

Add automated payment verification only after the provider and legal model are clear.

If the platform cannot legally or technically support paid competitions at launch, start with:

Free Daily Game Slots.

Direct manager payment links.

Manual payment tracking.

Strong registration and discovery features.

Ratings and reliability scores.

Paid competitions and automated payouts can be added after the audience and legal/payment model are validated.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6fe87573-cbf8-4cbd-9f96-6bd8994350d8).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
