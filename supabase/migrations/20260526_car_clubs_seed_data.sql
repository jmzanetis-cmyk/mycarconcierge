-- Gap #4: Car club seed data
-- Inserts 3 starter clubs so the Car Clubs feature has content on first launch.
-- Uses the admin profile (jm.zanetis@gmail.com) as provider_id so clubs appear
-- immediately without requiring a provider account.
-- Applied directly to production via Supabase MCP on 2026-05-26.

INSERT INTO car_clubs (provider_id, name, description, vehicle_make, region, member_count, theme_color, welcome_message, rules_text, is_active)
SELECT
  (SELECT id FROM profiles WHERE email = 'jm.zanetis@gmail.com' LIMIT 1),
  v.name, v.description, v.vehicle_make, v.region, 0, v.theme_color, v.welcome_message, v.rules_text, true
FROM (VALUES
  ('BMW Enthusiasts NJ',
   'New Jersey''s premier BMW owners club. Members enjoy exclusive service discounts, priority booking, and a community of fellow Bimmer fans.',
   'BMW', 'New Jersey', '#0066CC',
   'Welcome to BMW Enthusiasts NJ — the most active BMW club in the Garden State.',
   '1. Treat all members and providers with respect. 2. Club benefits are for personal vehicles only. 3. Abuse of rewards will result in removal. 4. Report service issues via the app.'),
  ('Honda & Acura Club',
   'Built for Honda and Acura owners who demand reliable, affordable service. Members get punch-card rewards and exclusive provider offers.',
   'Honda', 'Nationwide', '#CC0000',
   'Welcome to the Honda & Acura Club! Reliable cars deserve reliable service.',
   '1. Open to Honda and Acura vehicles of any model year. 2. Punch-card visits must be legitimate. 3. One membership per person. 4. Benefits expire as listed.'),
  ('Truck & SUV Owners',
   'For owners of trucks and SUVs who need heavy-duty service. Access preferred providers specialising in larger vehicles.',
   NULL, 'Nationwide', '#4A4A4A',
   'Welcome to Truck & SUV Owners — serious service for serious vehicles.',
   '1. Open to any truck or SUV owner. 2. Services must be for the registered vehicle. 3. Return-visit bonuses apply within 30 days. 4. Constructive feedback only.')
) AS v(name, description, vehicle_make, region, theme_color, welcome_message, rules_text)
WHERE NOT EXISTS (SELECT 1 FROM car_clubs WHERE car_clubs.name = v.name);
