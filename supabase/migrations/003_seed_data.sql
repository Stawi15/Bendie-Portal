-- ============================================================
-- SEED DATA FOR EXISTING DATABASE
-- Use this to link your existing auth account to an org + event
-- so you can see data in the portal.
--
-- Steps:
--   1. Go to Supabase Dashboard → Authentication → Users
--   2. Copy your UID (the UUID next to your email)
--   3. Replace 'YOUR_USER_UUID_HERE' below
--   4. Run in Supabase SQL Editor
-- ============================================================

DO $$
DECLARE
  v_user_id   UUID := 'YOUR_USER_UUID_HERE'; -- ← REPLACE THIS
  v_org_id    UUID;
  v_event_id  UUID;
BEGIN

  -- ── 1. Create or get your organization ──────────────────
  INSERT INTO organizations (name, slug, created_by)
  VALUES ('My Events Company', 'my-events-company', v_user_id)
  ON CONFLICT (slug) DO NOTHING;

  SELECT id INTO v_org_id FROM organizations WHERE slug = 'my-events-company';

  -- ── 2. Add yourself as org owner ────────────────────────
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner';

  -- ── 3. Create a sample event ────────────────────────────
  INSERT INTO events (
    organization_id,
    name,
    slug,
    description,
    status,
    location,
    starts_at,
    ends_at,
    attendee_limit,
    event_type,
    networking_mode,
    interests_enabled,
    theme_primary,
    theme_secondary,
    theme_tertiary,
    hero_title,
    hero_description,
    created_by
  ) VALUES (
    v_org_id,
    'Annual Tech Summit 2026',
    'tech-summit-2026',
    'Our flagship annual technology conference bringing together innovators, developers, and leaders from across the industry.',
    'active',
    'Cape Town International Convention Centre',
    '2026-09-15 08:00:00+02',
    '2026-09-17 18:00:00+02',
    500,
    'conference',
    'full',
    true,
    '#3B82F6',
    '#1D4ED8',
    '#DBEAFE',
    'Welcome to Tech Summit 2026',
    'Three days of insights, innovation, and connection.',
    v_user_id
  )
  ON CONFLICT DO NOTHING;

  SELECT id INTO v_event_id
  FROM events
  WHERE slug = 'tech-summit-2026' AND organization_id = v_org_id;

  -- ── 4. Add yourself as event host ───────────────────────
  INSERT INTO event_members (event_id, user_id, organization_id, role, onboarding_status)
  VALUES (v_event_id, v_user_id, v_org_id, 'host', 'completed')
  ON CONFLICT (event_id, user_id) DO UPDATE SET role = 'host';

  -- ── 5. Update your profile's current event/org ──────────
  UPDATE profiles
  SET
    current_organization_id = v_org_id,
    current_event_id        = v_event_id
  WHERE id = v_user_id;

  -- ── 6. Sample facilitators ──────────────────────────────
  INSERT INTO facilitators (event_id, full_name, job_title, organization, bio, display_order) VALUES
    (v_event_id, 'Sarah Johnson', 'Head of Product', 'TechCorp', 'Sarah brings 12 years of product leadership experience.', 1),
    (v_event_id, 'Marcus Williams', 'Cloud Architect', 'CloudBase', 'Marcus specialises in distributed systems at scale.', 2),
    (v_event_id, 'Priya Naidoo', 'AI Research Lead', 'DeepMind SA', 'Priya leads AI/ML research across applied domains.', 3);

  -- ── 7. Sample agenda sessions ───────────────────────────
  INSERT INTO agenda_sessions (event_id, title, description, starts_at, ends_at, location, block_type, audience, display_order, created_by) VALUES
    (v_event_id, 'Opening Keynote', 'Welcome address and state of the industry.', '2026-09-15 09:00:00+02', '2026-09-15 10:00:00+02', 'Main Hall', 'ceremony', 'everyone', 1, v_user_id),
    (v_event_id, 'The Future of AI', 'Deep dive into AI trends shaping the next decade.', '2026-09-15 10:30:00+02', '2026-09-15 12:00:00+02', 'Main Hall', 'session', 'everyone', 2, v_user_id),
    (v_event_id, 'Workshop: Cloud Native Dev', 'Hands-on workshop on cloud-native apps.', '2026-09-15 13:00:00+02', '2026-09-15 15:00:00+02', 'Workshop Room A', 'activity', 'everyone', 3, v_user_id),
    (v_event_id, 'Networking Happy Hour', 'Casual networking with drinks and snacks.', '2026-09-15 17:00:00+02', '2026-09-15 19:00:00+02', 'Rooftop Terrace', 'freetime', 'everyone', 4, v_user_id);

  -- ── 8. Sample FAQs ──────────────────────────────────────
  INSERT INTO faqs (event_id, section, question, answer, display_order) VALUES
    (v_event_id, 'General', 'What is the dress code?', 'Smart casual. Comfortable professional attire is recommended.', 1),
    (v_event_id, 'Logistics', 'Is parking available?', 'Yes, parking is available at the venue at R80/day.', 2),
    (v_event_id, 'Content', 'Will sessions be recorded?', 'Yes, keynote sessions will be available within 72 hours.', 3),
    (v_event_id, 'Catering', 'Is lunch provided?', 'Yes, lunch and refreshments are included on all conference days.', 4);

  -- ── 9. Sample activities ────────────────────────────────
  INSERT INTO activities (event_id, title, description, location, is_featured, display_order, created_by) VALUES
    (v_event_id, 'Morning Run', 'Group morning run along the Waterfront. All fitness levels welcome.', 'Hotel Lobby', false, 1, v_user_id),
    (v_event_id, 'Team Trivia', 'Evening trivia competition. Form teams of 4-6 at registration.', 'Conference Bar', true, 2, v_user_id),
    (v_event_id, 'City Walking Tour', 'Guided historical walking tour of the CBD.', 'Main Entrance', false, 3, v_user_id);

  RAISE NOTICE '✅ Seed complete!';
  RAISE NOTICE '   Org ID:   %', v_org_id;
  RAISE NOTICE '   Event ID: %', v_event_id;
  RAISE NOTICE '   You are: org owner + event host';

END $$;
--   Replace 'YOUR_USER_UUID_HERE' with it
-- ============================================================

DO $$
DECLARE
  v_user_id        UUID := 'YOUR_USER_UUID_HERE'; -- ← REPLACE THIS
  v_org_id         UUID;
  v_event_id       UUID;
BEGIN

  -- ============================================================
  -- 1. CREATE ORGANIZATION
  -- ============================================================
  INSERT INTO organizations (name, slug)
  VALUES ('My Events Company', 'my-events-company')
  ON CONFLICT (slug) DO NOTHING
  RETURNING id INTO v_org_id;

  -- If org already exists, get its id
  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM organizations WHERE slug = 'my-events-company';
  END IF;

  -- ============================================================
  -- 2. ADD USER AS ORG OWNER
  -- ============================================================
  INSERT INTO organization_members (organization_id, user_id, role)
  VALUES (v_org_id, v_user_id, 'owner')
  ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'owner';

  -- ============================================================
  -- 3. CREATE A SAMPLE EVENT
  -- ============================================================
  INSERT INTO events (
    organization_id,
    name,
    slug,
    description,
    status,
    location,
    starts_at,
    ends_at,
    attendee_limit,
    primary_color,
    secondary_color,
    tertiary_color
  )
  VALUES (
    v_org_id,
    'Annual Tech Summit 2026',
    'tech-summit-2026',
    'Our flagship annual technology conference bringing together innovators, developers, and leaders from across the industry.',
    'active',
    'Cape Town International Convention Centre, Cape Town',
    '2026-09-15 08:00:00+02',
    '2026-09-17 18:00:00+02',
    500,
    '#3B82F6',
    '#1D4ED8',
    '#DBEAFE'
  )
  ON CONFLICT (organization_id, slug) DO NOTHING
  RETURNING id INTO v_event_id;

  -- If event already exists, get its id
  IF v_event_id IS NULL THEN
    SELECT id INTO v_event_id FROM events WHERE slug = 'tech-summit-2026' AND organization_id = v_org_id;
  END IF;

  -- ============================================================
  -- 4. ADD USER AS EVENT HOST
  -- ============================================================
  INSERT INTO event_members (event_id, user_id, role)
  VALUES (v_event_id, v_user_id, 'host')
  ON CONFLICT (event_id, user_id) DO UPDATE SET role = 'host';

  -- ============================================================
  -- 5. SEED SAMPLE FACILITATORS
  -- ============================================================
  INSERT INTO facilitators (event_id, name, title, bio, display_order) VALUES
    (v_event_id, 'Sarah Johnson', 'Head of Product', 'Sarah brings 12 years of product leadership experience from top tech companies.', 1),
    (v_event_id, 'Marcus Williams', 'Cloud Architect', 'Marcus specialises in distributed systems and has designed infrastructure for scale.', 2),
    (v_event_id, 'Priya Naidoo', 'AI Research Lead', 'Priya leads AI/ML research and has published extensively on applied machine learning.', 3);

  -- ============================================================
  -- 6. SEED SAMPLE AGENDA SESSIONS
  -- ============================================================
  INSERT INTO agenda_sessions (event_id, title, description, starts_at, ends_at, location, display_order) VALUES
    (v_event_id, 'Opening Keynote', 'Welcome address and state of the industry overview.', '2026-09-15 09:00:00+02', '2026-09-15 10:00:00+02', 'Main Hall', 1),
    (v_event_id, 'The Future of AI', 'Deep dive into AI trends shaping the next decade.', '2026-09-15 10:30:00+02', '2026-09-15 12:00:00+02', 'Main Hall', 2),
    (v_event_id, 'Workshop: Cloud Native Dev', 'Hands-on workshop on building cloud-native applications.', '2026-09-15 13:00:00+02', '2026-09-15 15:00:00+02', 'Workshop Room A', 3),
    (v_event_id, 'Networking Happy Hour', 'Casual networking session with drinks and snacks.', '2026-09-15 17:00:00+02', '2026-09-15 19:00:00+02', 'Rooftop Terrace', 4);

  -- ============================================================
  -- 7. SEED SAMPLE FAQS
  -- ============================================================
  INSERT INTO faqs (event_id, question, answer, display_order) VALUES
    (v_event_id, 'What is the dress code?', 'Smart casual. Comfortable professional attire is recommended.', 1),
    (v_event_id, 'Is parking available?', 'Yes, parking is available at the CTICC at R80/day. Alternatively, the venue is accessible via MyCiTi bus.', 2),
    (v_event_id, 'Will sessions be recorded?', 'Yes, keynote sessions will be recorded and made available to registered attendees within 72 hours.', 3),
    (v_event_id, 'Is lunch provided?', 'Yes, lunch and refreshments are included in your registration fee on all conference days.', 4),
    (v_event_id, 'Can I transfer my ticket?', 'Tickets can be transferred up to 48 hours before the event. Contact support@techsummit.co.za.', 5);

  -- ============================================================
  -- 8. SEED SAMPLE ACTIVITIES
  -- ============================================================
  INSERT INTO activities (event_id, name, description, category, location) VALUES
    (v_event_id, 'Morning Run', 'Group morning run along the V&A Waterfront. All fitness levels welcome.', 'wellness', 'Meet at Hotel Lobby'),
    (v_event_id, 'Team Trivia', 'Evening trivia competition. Form teams of 4-6 people at registration.', 'social', 'Conference Bar'),
    (v_event_id, 'City Walking Tour', 'Guided historical walking tour of Cape Town CBD.', 'excursion', 'Meet at Main Entrance');

  RAISE NOTICE 'Seed data created successfully!';
  RAISE NOTICE 'Organization ID: %', v_org_id;
  RAISE NOTICE 'Event ID: %', v_event_id;
  RAISE NOTICE 'User added as: org owner + event host';

END $$;
