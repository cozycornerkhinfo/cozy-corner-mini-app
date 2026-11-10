# Cozy Corner Membership & Loyalty System

## Product decision

Support both entry channels and both customer surfaces:

- QR code -> responsive Web Membership App
- Telegram bot -> Telegram Mini App
- Both surfaces use one Supabase project, one member identity, and the same business rules.
- Admin staff use a protected web dashboard.

## Architecture

    QR / Browser ---------------------- Telegram Bot / Mini App
           \                                  /
            \---- Shared Customer UI/API ----/
                           |
                    Supabase Auth
              (phone OTP / Telegram link)
                           |
                 Supabase Edge Functions
           (registration, orders, tier, rewards,
              campaign audience, notifications)
                           |
                    PostgreSQL / RLS
          members | transactions | tier_rules
          rewards | campaigns | notification_log
                           |
                 Admin Web Dashboard
                           |
                Telegram Bot Notifications

## Customer journeys

1. **QR registration:** customer scans a store QR, opens the web app, enters name and phone, verifies phone OTP, accepts marketing consent separately, and receives a digital member card.
2. **Telegram registration:** customer opens the bot and Mini App. The backend validates Telegram Web App initData (never trust a client-supplied Telegram ID), then links the Telegram account to an existing phone-verified member or starts phone verification for a new member.
3. **Cross-channel identity:** phone number is the primary human identity; telegram_user_id is a nullable unique link. A customer can use web and Telegram without creating duplicate profiles.
4. **Purchase capture:** completed orders from the existing Cozy Corner order system create an idempotent transaction using the source order ID. Staff can also record an in-store purchase from the admin dashboard.
5. **Rank calculation:** lifetime net spend is calculated from posted purchases less posted refunds. Tier thresholds are configurable in tier_rules; no threshold is hard-coded in the customer app.
6. **Leaderboard:** monthly top spenders are calculated from posted transactions for the selected calendar month. Show only opted-in display names or masked member codes; never expose phone numbers.
7. **Promotions:** admins create a campaign, choose all members or a tier/audience, preview the audience, then send. Telegram delivery requires the member to have started the bot. Marketing consent and notification preferences must be respected.

## Suggested database model

- members: member code, name, normalized phone, Supabase auth user, Telegram user ID, marketing consent, status, created time.
- tier_rules: tier key, display name, minimum lifetime net spend, benefits description, sort order, active flag.
- sales_transactions: member, source order ID, transaction kind (purchase/refund), amount, currency, status, occurred time, source. Unique source order + kind prevents duplicate imports.
- rewards: member, reward type, points/discount, status, expiry, redeemed time.
- campaigns: title, message, audience rule, scheduled/sent time, status.
- notification_log: member, campaign, channel, delivery status, provider message ID, error.
- member_preferences: channel preferences and leaderboard visibility.

## Security and operational rules

- Enable Row Level Security on every customer table. Customers may read/update only their own permitted profile fields; never allow clients to write spend, tier, reward balance, or transaction status.
- All purchase imports, refunds, tier changes, reward issuance/redemption, campaign sends, and Telegram identity verification happen in trusted Edge Functions.
- Keep Supabase service-role keys and Telegram bot tokens server-side only.
- Verify Telegram Web App initData on the server and enforce an auth-date freshness window.
- Use idempotency keys for order imports, reward issuance, and campaign jobs.
- Record staff actions and refunds in an audit log.
- Keep marketing consent separate from service messages; include opt-out controls.
- Store currency explicitly per transaction. Do not silently combine different currencies in rankings.

## Admin dashboard modules

1. Overview: total active members, new members, monthly spend, top members, tier distribution.
2. Members: search by member code/name/phone, profile, purchase history, linked Telegram status.
3. Transactions: order imports, manual sale entry, refund workflow, duplicate protection.
4. Tiers & benefits: editable thresholds, benefit copy, effective dates.
5. Campaigns: audience filters, preview count, draft/preview/send, delivery report.
6. Rewards: issue, redeem, expiry, and audit history.
7. Settings: store currency, QR join URL, Telegram bot, consent text, staff roles.

## UI direction

Minimal, warm, contemporary café identity: warm ivory background, charcoal typography, muted forest-green accent, restrained copper/gold for higher tiers, generous spacing, rounded cards. Mobile-first customer experience; desktop-first admin dashboard.

## Delivery phases

- **Phase 1:** membership schema, secure registration/linking, customer digital card, member profile.
- **Phase 2:** order-system integration, transaction ledger, configurable tiers and monthly leaderboard.
- **Phase 3:** campaign composer, Telegram notifications, preferences and delivery logs.
- **Phase 4:** rewards, redemption, analytics, staff roles and audit trail.

## Open configuration (do not assume)

Before production, confirm store currency, tier thresholds/benefits, leaderboard period and visibility, marketing consent wording, and whether spending is lifetime or rolling 12-month for tier qualification. The proposed default is lifetime net spend for tiers and calendar-month spend for leaderboard.
