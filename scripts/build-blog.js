#!/usr/bin/env node
/**
 * One-shot blog generator for My Car Concierge.
 *
 * Reads the POSTS array below and writes one HTML file per post into
 * www/blog/<slug>.html plus the listing page www/blog/index.html.
 * Each post carries inline Article + BreadcrumbList JSON-LD and follows the
 * marketing-page chrome (header / footer.js / shared CSS variables).
 *
 * Run:  node scripts/build-blog.js
 *
 * Idempotent: re-running overwrites the generated files. The SEO meta block
 * is then injected by scripts/inject-seo-meta.js (which knows about /blog/*
 * and auto-derives title / description from the rendered HTML).
 */

const fs   = require('fs');
const path = require('path');

const SITE       = 'https://www.mycarconcierge.com';
const SITE_NAME  = 'My Car Concierge';
const AUTHOR     = 'The My Car Concierge Team';
const OG_IMAGE   = `${SITE}/og-card.png`;
const BLOG_DIR   = path.join(__dirname, '..', 'www', 'blog');

const PILLARS = {
  quotes:   { label: 'Get Quotes',          color: '#c9a227' },
  manage:   { label: 'Manage Vehicles',     color: '#22d3ee' },
  maintain: { label: 'Maintaining Your Ride', color: '#fb923c' },
  shop:     { label: 'Shop Smarter',        color: '#34d399' },
};

// ----------------------------------------------------------------------------
// 10 pillar articles. Each `body` is plain HTML — paragraphs, h2/h3, ul/ol,
// callouts, blockquotes. Keep posts in the 1,200-1,800 word range. Include
// 2-3 internal links to marketing pages. End with a CTA card (auto-injected).
// ----------------------------------------------------------------------------
const POSTS = [
  // ============ PILLAR 1: GET QUOTES (3 posts) ============
  {
    slug: 'how-to-compare-auto-repair-quotes',
    pillar: 'quotes',
    title: 'How to Compare Auto Repair Quotes Without Getting Ripped Off (2026 Guide)',
    excerpt: 'A field-tested framework for comparing auto repair quotes line-by-line — what numbers actually matter, the words that signal a markup, and how to negotiate without sounding like you\'re negotiating.',
    date: '2026-04-22',
    readingTime: '9 min read',
    body: `
<p>You took your car in for what felt like a small problem. The quote came back at $1,800. The shop next door says $640 for the same job. The third shop won't quote until they "open it up." Welcome to the most quietly miserable experience in modern car ownership.</p>

<p>Auto repair pricing isn't really opaque on purpose — it's opaque because three different shops can do the same job three different ways, with parts of three different qualities, and finish in three different amounts of time. The trick to comparing quotes isn't getting more quotes. It's learning what to compare.</p>

<h2>The four numbers every quote should break out</h2>

<p>A quote you can actually compare always has these four lines, separately:</p>

<ol>
  <li><strong>Parts.</strong> Brand, part number, and whether it's OEM (original-equipment manufacturer), OE-equivalent, or aftermarket. "Brake pads — $180" is not a quote. "Akebono Pro-ACT ceramic pads, part EUR1467 — $148" is.</li>
  <li><strong>Labor hours.</strong> Almost every shop bills against a flat-rate book (Mitchell, AllData, or the manufacturer's own time guide). The quote should say "2.4 hours @ $145/hr." If it just says "labor — $480," ask for the hours and the rate.</li>
  <li><strong>Shop supplies / consumables.</strong> Often a 5–10% surcharge or a flat fee. This is real (rags, sealant, brake cleaner, gloves) but it should be a line you can see, not a markup hidden in the parts price.</li>
  <li><strong>Diagnostic / inspection time.</strong> Should be its own line. Many shops will waive this if you authorize the work. If yours doesn't, ask why.</li>
</ol>

<p>Once each quote has those four numbers, you can compare apples to apples. Without them you're comparing fruit baskets — which is exactly what every shop is hoping for.</p>

<h2>Words that should make you slow down</h2>

<p>None of these are dishonest on their own. They're just signals that the quote isn't quite what it looks like:</p>

<ul>
  <li><strong>"While we're in there..."</strong> — Sometimes legit (the labor overlap is real on a timing belt + water pump). Sometimes a $400 add-on you didn't ask for. Make the shop tell you which.</li>
  <li><strong>"Multi-point inspection."</strong> Free is fine. But every "yellow" item on the resulting checklist is a future upsell. Ask for the actual measurements (brake-pad mm, tire tread mm, battery cold-cranking amps), not the color.</li>
  <li><strong>"Updated estimate" with no scope change.</strong> Estimates can grow legitimately when work begins, but you should be told <em>what</em> changed, not just <em>that</em> it changed.</li>
  <li><strong>"We only use OEM."</strong> Sometimes the right answer (modern transmissions, electronics, sensors). Often a 2× markup on parts a Tier-1 supplier makes for half the price under a different label.</li>
</ul>

<h2>The 30-second negotiation script</h2>

<p>You don't have to be confrontational to get a fair price. You just have to be specific:</p>

<blockquote>"I appreciate the quote. I'm getting two other estimates and want to make sure I'm comparing them properly. Can you send me a written quote that breaks out parts (with brand and part number), labor hours and rate, and any shop fees as separate lines? I'd like to make a decision in the next two days."</blockquote>

<p>That paragraph does four things at once: signals you're informed, signals you're moving fast, signals you're going to compare, and gives them the chance to sharpen their pencil before they lose the work. About a third of the time, the quote that comes back is lower than the verbal one — for the same scope.</p>

<h2>How to handle the "we have to open it up" quote</h2>

<p>Sometimes a shop genuinely can't quote without disassembly (internal transmission work, head-gasket repair, electrical gremlins). In those cases, get them to commit to two things in writing:</p>

<ol>
  <li>A capped diagnostic fee (e.g. "diagnosis up to 1.5 hours, $217 max — call before exceeding").</li>
  <li>A "stop work" threshold ("call me before authorizing anything over $X"). $500 is a reasonable default for most jobs.</li>
</ol>

<p>That single sentence — "call me before exceeding $X" — has saved drivers thousands of dollars. Make it standard practice.</p>

<h2>The fast way to get three real quotes</h2>

<p>The reason most people accept the first quote is because getting a second one is genuinely a pain. You have to call around, leave voicemails, drop the car off, wait. Every shop has a different intake process. By the time you'd have three quotes, the car is already fixed.</p>

<p>The single biggest leverage point is to <a href="/how-it-works.html">post the job once</a> and let qualified providers come back with quotes that are already structured the same way — same parts breakout, same labor lines, same fees. Side-by-side comparison takes minutes. We built My Car Concierge specifically because the alternative is a lot of phone calls that should be a marketplace.</p>

<h2>The bottom line</h2>

<p>The single best thing you can do as a car owner is get used to asking for itemized quotes <em>before</em> you authorize work. Once you do, the difference between shops gets weirdly obvious. The shop that won't itemize is telling you something. The shop that itemizes happily is also telling you something. Both signals are worth paying attention to.</p>

<p>Compare the four numbers. Watch for the four phrases. Cap the diagnostic fee. Get three real quotes, not three vague ones. You'll spend 20 minutes and probably save several hundred dollars on your next big repair.</p>
    `,
    related: ['fair-brake-job-cost-2026', 'how-to-find-trustworthy-mechanic', 'extended-warranty-vs-repair-fund'],
  },

  {
    slug: 'fair-brake-job-cost-2026',
    pillar: 'quotes',
    title: 'What Does a Fair Brake Job Cost in 2026? Real Numbers by Vehicle Class',
    excerpt: 'A clear breakdown of what brake pads, rotors, and full brake jobs actually cost in 2026 — by vehicle class, parts grade, and labor market — plus the $200 mistake most drivers make.',
    date: '2026-04-15',
    readingTime: '8 min read',
    body: `
<p>"How much should a brake job cost?" is the most-Googled car repair question for a reason: the honest answer is "between $180 and $1,400, and most of the spread is legitimate." Below is what the spread actually looks like in 2026, and how to know which end of it you should be on.</p>

<h2>What's in a "brake job"</h2>

<p>The phrase covers four very different jobs, and the price gap between them is huge:</p>

<ul>
  <li><strong>Pads only.</strong> Replace just the friction material. Cheapest. Right answer when rotors are still within spec.</li>
  <li><strong>Pads + rotor resurfacing ("turning").</strong> Pads plus a machine pass on the rotor faces. Increasingly rare in 2026 — most modern rotors are too thin to safely turn.</li>
  <li><strong>Pads + rotors.</strong> Replace both. The standard job on most cars more than two pad-sets in.</li>
  <li><strong>Full brake service.</strong> Pads, rotors, hardware kit (clips, pins, slides), brake fluid flush, and caliper inspection. Right answer once every 60,000–80,000 miles.</li>
</ul>

<h2>2026 price ranges, per axle</h2>

<p>These are real shop quotes from across the U.S. for the most common scenarios. "Per axle" means front <em>or</em> rear, not both. Most cars wear front brakes faster, so the front axle is usually the first big bill.</p>

<h3>Compact / sedan (Civic, Corolla, Sentra, Elantra)</h3>
<ul>
  <li>Pads only: <strong>$180–$260</strong></li>
  <li>Pads + rotors: <strong>$320–$520</strong></li>
  <li>Full brake service: <strong>$480–$700</strong></li>
</ul>

<h3>Mid-size SUV / crossover (CR-V, RAV4, Equinox, Rogue)</h3>
<ul>
  <li>Pads only: <strong>$220–$320</strong></li>
  <li>Pads + rotors: <strong>$420–$640</strong></li>
  <li>Full brake service: <strong>$580–$880</strong></li>
</ul>

<h3>Full-size truck / large SUV (F-150, Silverado, Tahoe, Expedition)</h3>
<ul>
  <li>Pads only: <strong>$280–$420</strong></li>
  <li>Pads + rotors: <strong>$540–$880</strong></li>
  <li>Full brake service: <strong>$780–$1,200</strong></li>
</ul>

<h3>European luxury (BMW, Mercedes, Audi)</h3>
<ul>
  <li>Pads only: <strong>$320–$540</strong> (often includes wear sensor)</li>
  <li>Pads + rotors: <strong>$680–$1,200</strong></li>
  <li>Full brake service: <strong>$1,000–$1,800</strong></li>
</ul>

<h3>EVs (Model 3, Mach-E, Bolt, Ioniq 5)</h3>
<ul>
  <li>Pads only: <strong>$220–$360</strong></li>
  <li>Pads + rotors: <strong>$440–$720</strong></li>
  <li>Important note: regenerative braking dramatically extends pad life. Many EVs go 80,000+ miles before pads are at replacement spec. The bigger maintenance issue is rust on under-used rotors, not wear.</li>
</ul>

<h2>Why the spread within each row is so wide</h2>

<p>Three things drive the spread, and only one is shop-by-shop variance:</p>

<ol>
  <li><strong>Parts grade.</strong> Economy ceramic pads are $35–$60 per axle. Premium ceramic with copper-free formulation are $90–$140. OE-spec from the dealer can hit $200+. The labor is identical, but the price-to-customer can swing $150 just on parts choice.</li>
  <li><strong>Labor rate.</strong> Independent shop in a low-cost-of-living area: $95–$110/hr. Dealer in a metro: $185–$240/hr. Same 1.8 hours of work; very different bill.</li>
  <li><strong>Hardware kit.</strong> A proper job replaces the slide pins, anti-rattle clips, and caliper bolts. Some shops include this. Some skip it and you'll hear it in the form of a brake squeal in 4,000 miles.</li>
</ol>

<h2>The $200 mistake most drivers make</h2>

<p>Saying yes to "we'll need to replace the rotors too" without asking for the rotor measurement.</p>

<p>Every rotor has a "minimum thickness" stamped on its hub — usually 22mm to 28mm depending on vehicle. A shop replacing rotors has no excuse not to measure yours and tell you the number. If your rotors are still 1mm or more above the minimum and have no deep grooves, hot spots, or hard pulsation, you can run the next pad set on them.</p>

<p>That's a $180–$300 difference per axle. The whole conversation takes 30 seconds.</p>

<div class="callout callout-tip">
  <h3>Quick check before you authorize</h3>
  <p>Ask: "What's the rotor thickness measurement, and what's the minimum spec?" A reputable shop will read it off the caliper or the inspection sheet. A shop that mumbles is a shop you should question.</p>
</div>

<h2>What about lifetime brake-pad warranties?</h2>

<p>Most chain shops offer them. They're not a scam, but they don't mean "free brakes for life." Read the fine print. They almost always:</p>
<ul>
  <li>Cover the pads themselves but not the labor to install them.</li>
  <li>Require the same shop to perform every replacement.</li>
  <li>Don't apply if rotors need replacement (they almost always will after a couple cycles).</li>
</ul>
<p>So the "free" replacement four years later usually still costs $180–$280 in labor and parts. Not nothing. Not free. Worth what you pay for the upgrade if it's $40–$60 — not worth $150.</p>

<h2>How to know you're getting a fair price right now</h2>

<p>Use the 2026 ranges above as a sanity check on whatever quote you have in hand. If your quote is at the high end and the shop hasn't itemized parts brand, labor hours, and hardware, that's the conversation to have. If the quote is below the low end of the range, ask whether the hardware kit is included and what the pad warranty looks like — sometimes "cheap" really is cheap.</p>

<p>The fastest way to confirm the number is fair is to <a href="/how-it-works.html">post the job</a> and see what two or three vetted shops actually bid. Brake jobs are one of the most quoted services on My Car Concierge, and the spread between the high and low bid on the exact same scope is usually $150–$300.</p>

<p>That's the difference between an honest day's work and a payment on someone's marketing budget. Worth knowing the difference.</p>
    `,
    related: ['how-to-compare-auto-repair-quotes', 'oil-change-intervals-2026', 'how-to-find-trustworthy-mechanic'],
  },

  {
    slug: 'how-to-find-trustworthy-mechanic',
    pillar: 'quotes',
    title: 'How to Find a Trustworthy Mechanic in Your Area: A Vetting Playbook',
    excerpt: 'A practical, repeatable process for finding a mechanic you can rely on for the next 10 years — what to ask, what to ignore, and what to test before handing over the keys.',
    date: '2026-04-08',
    readingTime: '7 min read',
    body: `
<p>The most valuable possession in modern car ownership isn't the car. It's a mechanic you trust. A good one will save you tens of thousands of dollars over the life of a vehicle, catch problems before they're catastrophic, and stop the slow bleed of "while you're in there" upcharges that defines the bad-shop experience.</p>

<p>The bad news: there is no Yelp filter for "actually trustworthy." The good news: the process for finding one is repeatable, takes about an hour of effort, and you only have to do it once every five to ten years.</p>

<h2>Step 1: Decide what kind of shop you actually need</h2>

<p>Most drivers default to "any shop that's open." That's how you end up with the wrong shop for your vehicle. There are really four categories worth knowing:</p>

<ul>
  <li><strong>Dealership service.</strong> Best for warranty work, recalls, software updates, and weird factory-specific problems on cars under 5 years old. Usually the most expensive labor rate. Almost always uses OEM parts.</li>
  <li><strong>Independent specialist.</strong> A shop that focuses on one or two brands (BMW, Subaru, German marques, Japanese imports). Often run by a former dealer tech. For older luxury or import vehicles, this is almost always your best value.</li>
  <li><strong>General independent.</strong> Works on anything. Good for routine maintenance and common repairs. The category with the widest quality range — some are gems, some are guessers.</li>
  <li><strong>Chain stores.</strong> Often best for tires, alignments, oil changes, and brake-pad swaps where the work is standardized. Worse for diagnostics and complex work because techs rotate frequently.</li>
</ul>

<p>Match the category to the car. A 12-year-old Audi at the corner Pep Boys is a story that ends with a $2,800 bill that didn't fix the problem. A new Subaru at a German specialist is wasted expertise. Be deliberate.</p>

<h2>Step 2: Build a candidate list of 3–5 shops</h2>

<p>Sources, in roughly descending order of usefulness:</p>

<ol>
  <li><strong>The local owners' forum or Reddit subreddit for your make.</strong> Real owners, real long-term experiences, real names of techs they trust.</li>
  <li><strong>The mobile detailer or independent body shop you already use.</strong> They know who in town does honest work because they refer customers and they hear complaints.</li>
  <li><strong>Insurance shop networks.</strong> Insurance carriers vet shops they refer body work to. They're pickier than they get credit for.</li>
  <li><strong>Google reviews — but read the 3-star reviews, not the 5-star ones.</strong> A thoughtful 3-star is more honest than fifty 5-stars from people who got a free coffee.</li>
</ol>

<h2>Step 3: The three-question phone call</h2>

<p>Call each candidate. The receptionist's tone matters. The mechanic's willingness to come to the phone matters more. Ask:</p>

<ol>
  <li><strong>"Do you have a flat labor rate, and what is it?"</strong> Real shops answer in five seconds. Shops that hedge ("depends on the work") are a small flag.</li>
  <li><strong>"Will you give me a written, itemized quote — with parts brand, labor hours, and shop fees broken out separately — before any work?"</strong> The right answer is "Yes, of course." Anything else is a problem.</li>
  <li><strong>"Do you call before authorizing additional work over a dollar threshold I set?"</strong> A shop that says "yes, we always call" is a shop that's been burned by the alternative — they've adopted the right policy.</li>
</ol>

<p>Three questions, four minutes. You can rule out half the candidates this way.</p>

<h2>Step 4: Test them on something small</h2>

<p>Don't take in your transmission rebuild as the first job. Take in something with a clear right answer. Examples:</p>

<ul>
  <li>An oil change with a tire rotation.</li>
  <li>A state inspection.</li>
  <li>A wheel alignment.</li>
  <li>A specific small thing you've already had diagnosed elsewhere.</li>
</ul>

<p>Watch how they handle the small job. Did they get it done in the time they said? Did they recommend anything else, and if so, did they show you the actual measurement (brake-pad mm, tire tread depth, battery health)? Did they wash their hands before getting back in your driver's seat? (You'd be surprised how often that detail predicts the rest.)</p>

<p>A shop that handles a $90 oil change like a $900 job is a shop you can trust with a $900 job.</p>

<h2>Green flags worth more than reviews</h2>

<ul>
  <li><strong>ASE-certified technicians, with the certifications dated and current.</strong> Certifications expire every five years. Current means they're still in the trade.</li>
  <li><strong>A clean, organized shop floor.</strong> Sounds superficial; isn't. A messy shop is a shop where your air filter ends up under someone's coffee.</li>
  <li><strong>They show you the old parts.</strong> "Here's the worn pad — you can see the crack" is the language of a shop that wants you to come back.</li>
  <li><strong>They have customers their parents' age <em>and</em> their kids' age.</strong> The five-decade customer base is the highest-quality signal there is.</li>
</ul>

<h2>Red flags worth taking seriously</h2>

<ul>
  <li><strong>Cash discount</strong> with the implication that going on the books is more expensive. Sometimes innocent; often a tax-evasion signal that correlates with shortcut work.</li>
  <li><strong>Pushing services on every visit.</strong> Throttle-body cleanings, fuel-system flushes, and "engine restoration treatments" on a 30,000-mile car are usually upsells, not maintenance.</li>
  <li><strong>The "your timing chain looks loose" sales pitch on a low-mileage car.</strong> Timing chains can stretch, but the diagnosis requires a borescope or a tooth-count test, not a glance.</li>
  <li><strong>The high-pressure close.</strong> "We need to know in the next 20 minutes" is fine for a tire patch on a busy Friday. It's not fine for a $4,000 repair.</li>
</ul>

<h2>The shortcut: let the shops compete</h2>

<p>The vetting process above works. It also takes time most people don't have. The shortcut is to <a href="/providers-directory.html">browse vetted providers in your area</a> who have already passed background checks, insurance verification, and a public review history — then post your job and let them quote it competitively.</p>

<p>The right mechanic wants to win the work. The wrong mechanic wants to keep you from comparing. Once you understand which is which, the rest of car ownership gets dramatically less stressful.</p>
    `,
    related: ['how-to-compare-auto-repair-quotes', 'fair-brake-job-cost-2026', 'used-car-buying-checklist'],
  },

  // ============ PILLAR 2: MANAGE VEHICLES (2 posts) ============
  {
    slug: 'how-long-do-modern-cars-last',
    pillar: 'manage',
    title: 'How Long Do Modern Cars Actually Last? A Maintenance Reality Check',
    excerpt: 'The honest answer to "should I keep this car or trade it in" — what 200,000 miles really means in 2026, which systems fail first, and the maintenance habits that buy you another 100,000 miles.',
    date: '2026-04-01',
    readingTime: '8 min read',
    body: `
<p>"They don't make 'em like they used to" is half right. Modern cars are simultaneously the most reliable cars ever built <em>and</em> the most expensive cars to fix when they finally do break. Both things are true, and the practical implication for vehicle owners is interesting.</p>

<h2>The new normal: 200,000 miles is the floor, not the ceiling</h2>

<p>The data on this isn't subtle. iSeeCars' 2025 study tracked 2.2 million used vehicles and found that the average modern vehicle now reaches 200,000 miles routinely if maintained, and the top-performing models are crossing 250,000–300,000 miles regularly. Toyota Land Cruiser, Toyota Sequoia, Toyota Tundra, Honda Ridgeline, and Lexus LX all averaged over 280,000 miles in the 2025 cohort.</p>

<p>The picture varies by drivetrain:</p>

<ul>
  <li><strong>Naturally aspirated 4-cylinder Toyota / Honda engines:</strong> 250,000+ miles is normal. 350,000 isn't unusual with timing service done.</li>
  <li><strong>Modern V6 (Toyota 2GR, Honda J35):</strong> 250,000+ miles, but timing belt service at 90k–105k is non-negotiable.</li>
  <li><strong>Turbocharged 4-cylinders (Ecoboost, Hyundai/Kia 1.6T, BMW B48):</strong> Variable. 150,000–220,000 with strict oil change discipline. Less if you stretch oil intervals.</li>
  <li><strong>European V8s (BMW N63, Audi 4.0T):</strong> 120,000–180,000 before major work. Beautiful engines; expensive to keep alive.</li>
  <li><strong>EV battery packs:</strong> Tesla Model 3/Y: 200,000+ miles with 85–90% capacity remaining. LFP-chemistry packs even better. Earlier-generation packs (Leaf, pre-2018 Bolt) much worse.</li>
</ul>

<h2>What actually fails first on a modern car</h2>

<p>The engine outlasts everything else now. Of cars that get scrapped before 200,000 miles, the cause is almost never "the engine wore out." It's:</p>

<ol>
  <li><strong>Transmission.</strong> CVTs in particular have shorter expected lives than the engines paired with them. Replace fluid at 60k. If yours says "lifetime fluid," replace it at 60k anyway.</li>
  <li><strong>Rust and structural corrosion.</strong> Especially in salt-belt states. Rocker panels, frame rails, brake lines.</li>
  <li><strong>Electronics modules.</strong> ABS controllers, body control modules, instrument clusters. Often $1,500+ to replace; sometimes orphaned (no replacement available).</li>
  <li><strong>HVAC and accessory systems.</strong> AC compressors, heater cores, blower motors. Not catastrophic, just expensive.</li>
  <li><strong>Suspension components.</strong> Air ride systems, electronic shocks. Replace one and the others are right behind.</li>
</ol>

<p>Notice what's <em>not</em> on the list: the engine block, the heads, the crankshaft, the turbocharger (if you've changed oil on time), the alternator (most last 200k+), the starter (typically 150k+).</p>

<h2>The maintenance habits that buy you another 100,000 miles</h2>

<p>If you have one car and you intend to keep it forever, do these things and almost nothing else matters:</p>

<h3>1. Change the oil on the manufacturer's schedule, not the dashboard's.</h3>
<p>The dashboard maintenance minder is calibrated for the average driver in average conditions. If you do mostly short trips, tow occasionally, drive in dusty conditions, or drive a turbo engine, halve the recommended interval. This single habit doubles engine longevity.</p>

<h3>2. Change all fluids on a schedule.</h3>
<p>Brake fluid every 3 years. Coolant every 5 years (or by the spec — some are lifetime, most aren't). Transmission fluid every 60k. Differential fluid every 60k–80k on AWD vehicles. Power steering fluid every 60k if it's hydraulic.</p>

<h3>3. Replace the timing belt at the spec interval.</h3>
<p>If your engine has a timing belt (most Honda V6s, Subaru flat-4s through 2010, older Audi V6s), missing the 90k–105k replacement interval is the single fastest way to turn a $30,000 car into a paperweight. A snapped belt on an interference engine bends valves and sometimes destroys pistons. The repair often exceeds the car's value.</p>

<div class="callout callout-tip">
  <h3>Don't know if you have a timing belt or chain?</h3>
  <p>Search "[your engine code] timing belt or chain" — every engine forum has this answer. Or use a <a href="/developers.html">VIN lookup</a> to pull the engine code from your VIN, then check.</p>
</div>

<h3>4. Address rust before it spreads.</h3>
<p>Surface rust is cosmetic. Rust through the metal is structural. The conversion happens in 12–18 months once it starts. Catching it early means $200 of touch-up. Catching it late means $4,000 of frame work or scrapping the car.</p>

<h3>5. Keep records.</h3>
<p>Every receipt. Every service. Every part number. Even if you do the work yourself — write the date and mileage on a sticker on the part. When you do eventually sell the car, organized records add 10–15% to the sale price. When the car is failing intermittently and you're trying to figure out what was last touched, records are the difference between $200 of diagnosis and $1,200.</p>

<h2>The "should I keep it" math</h2>

<p>The simplest test for "is this car worth keeping": <em>annualize the major repair cost over the months you'll keep driving it</em>, then compare to the monthly cost of a replacement.</p>

<p>Example: Your 2014 Camry needs a $2,200 transmission service. You'd otherwise drive it another two years. That's $92/month. The cheapest reasonable replacement is $380/month including insurance and depreciation. The repair is the obvious answer — until something else is also imminent.</p>

<p>The honest version of the math also factors in: how much you'll spend on the next thing, how reliable the rest of the car is, and how much downtime stress you can tolerate. <a href="/about.html">Managing your vehicle's full history</a> in one place — service records, recall history, current value, projected repairs — is the single best thing you can do to make this decision sanely instead of emotionally.</p>

<h2>The bottom line</h2>

<p>A modern car maintained well lasts 250,000–300,000 miles routinely. A modern car maintained badly lasts 110,000–150,000. The difference between the two is a few hundred dollars a year of timely fluid changes and the discipline to replace timing components on the manufacturer's schedule, not the dashboard's.</p>

<p>Your engine will outlast almost everything else you bolt to it. Take that seriously and you'll never be surprised by a major repair.</p>
    `,
    related: ['oil-change-intervals-2026', 'repair-vs-replace-engine', 'vin-decoder-guide'],
  },

  {
    slug: 'vin-decoder-guide',
    pillar: 'manage',
    title: 'VIN Decoder Guide: What Your 17-Digit Code Reveals About Your Car',
    excerpt: 'A field guide to the 17 characters of your VIN — what each digit actually means, what you can decode for free, and the 6 things every owner should look up before buying or selling.',
    date: '2026-03-25',
    readingTime: '7 min read',
    body: `
<p>Your VIN — Vehicle Identification Number — is the closest thing your car has to a Social Security number. It's 17 characters long, it's globally unique, and embedded in it is a surprising amount of information: where the car was built, what engine it has, what model year, what restraint system was originally installed. It also unlocks everything else: title history, recall notices, insurance claims, theft records.</p>

<p>Most owners never decode it. Most owners should.</p>

<h2>Where your VIN actually lives</h2>

<p>You can read the same VIN off four places:</p>
<ol>
  <li><strong>Lower-left corner of the windshield</strong>, visible from outside through the glass.</li>
  <li><strong>Driver's-side door jamb sticker.</strong> Same VIN, plus tire spec, paint code, options.</li>
  <li><strong>The vehicle title and registration.</strong></li>
  <li><strong>Your insurance card.</strong></li>
</ol>

<p>If any of these don't match, stop and figure out why before doing anything else. A mismatched VIN is the single biggest red flag in a used-car transaction.</p>

<h2>Decoding the 17 characters</h2>

<p>Every VIN follows the same global ISO standard. Read left to right:</p>

<h3>Positions 1–3: World Manufacturer Identifier (WMI)</h3>
<p>The first character is the country of origin. <strong>1, 4, 5</strong> = United States. <strong>2</strong> = Canada. <strong>3</strong> = Mexico. <strong>J</strong> = Japan. <strong>K</strong> = South Korea. <strong>W</strong> = Germany. <strong>S</strong> = United Kingdom.</p>
<p>The next two characters identify the manufacturer and division. So "1HG" = Honda Motor Co. of Marysville, Ohio. "5YJ" = Tesla. "WBA" = BMW. "JTD" = Toyota.</p>

<h3>Positions 4–8: Vehicle Descriptor Section</h3>
<p>Vehicle line, body type, restraint system, engine. This is where "what engine does my car actually have" gets answered. The 8th position specifically is engine code on most vehicles — useful when you're chasing parts and the parts catalog asks for it.</p>

<h3>Position 9: Check digit</h3>
<p>A computed check digit. If you alter any other character, this won't math out. It's how computers detect a transcription error or a fraudulent VIN.</p>

<h3>Position 10: Model year</h3>
<p>One of the most useful single characters. Letters and numbers cycle on a known schedule. Recent values: <strong>L = 2020, M = 2021, N = 2022, P = 2023, R = 2024, S = 2025, T = 2026.</strong> (I, O, Q, U, Z, and 0 are skipped to avoid confusion.)</p>

<h3>Position 11: Plant code</h3>
<p>Identifies which factory built the car. Useful when there's a recall affecting only certain plants, or when researching long-term reliability of a specific assembly line.</p>

<h3>Positions 12–17: Serial number</h3>
<p>Sequential build number for that exact configuration at that exact plant.</p>

<h2>The six things to look up before you buy or sell</h2>

<p>Now that you can read your VIN, here's what to actually do with it:</p>

<ol>
  <li><strong>Open recalls.</strong> Free, instant, authoritative. Use the NHTSA tool at <em>nhtsa.gov/recalls</em>. Type the VIN; get every open safety recall on that exact car. Buyers should always check this. Sellers should fix outstanding recalls before listing — they're usually free at any dealer.</li>

  <li><strong>Title history and brand.</strong> Salvage, rebuilt, flood, lemon-law buyback. A "clean" Carfax/AutoCheck on a car with a salvage history is a fraud red flag. Both services charge per report; libraries often have free access.</li>

  <li><strong>Theft record.</strong> NICB has a free VINCheck tool. If a car is in their theft database, you don't want it.</li>

  <li><strong>Build sheet / window sticker.</strong> Most major manufacturers offer a free OEM window-sticker reprint by VIN. Confirms the original options and trim, which is how you catch a "loaded" listing that's actually base trim.</li>

  <li><strong>Service history.</strong> Many dealers will run a service-history report for free if you call with the VIN. Routine maintenance at the same dealer for years is a strong positive signal.</li>

  <li><strong>Engine code and exact build configuration.</strong> A <a href="/developers.html">VIN-based vehicle data lookup</a> returns the precise engine, transmission, drivetrain, and trim — useful when ordering parts, getting a quote, or comparing two seemingly identical listings that aren't.</li>
</ol>

<h2>What a VIN can't tell you</h2>

<p>A VIN reveals what the manufacturer originally built and what's officially recorded. It doesn't reveal:</p>
<ul>
  <li>Whether the timing belt was actually replaced. (Records can lie.)</li>
  <li>Whether the car was driven hard.</li>
  <li>Aftermarket modifications.</li>
  <li>Cash transactions or unreported damage.</li>
</ul>

<p>For those, you need a pre-purchase inspection. The VIN is step one, not the only step.</p>

<h2>The VIN check that takes 60 seconds and saves $4,000</h2>

<p>If you're buying any used vehicle, do this before you write a check:</p>

<ol>
  <li>Match the VIN on the windshield to the door jamb to the title.</li>
  <li>Run the NHTSA recall check (free, 30 seconds).</li>
  <li>Run the NICB theft check (free, 30 seconds).</li>
  <li>Pull a paid title history (Carfax or AutoCheck — about $40, often included in the seller's listing).</li>
</ol>

<p>If anything in those four steps surprises you, walk. The cost of one misread VIN is bigger than the cost of every Carfax you'll ever buy.</p>

<p>Once you own the car, save the VIN somewhere you can find it in a parking lot at midnight when you've been rear-ended. <a href="/about.html">Storing your full vehicle profile</a> — VIN, title, insurance, service history, and recall status — in one place is genuinely the highest-leverage 10 minutes of car ownership most drivers never spend.</p>
    `,
    related: ['used-car-buying-checklist', 'how-long-do-modern-cars-last', 'obd-ii-codes-explained'],
  },

  // ============ PILLAR 3: MAINTAINING YOUR RIDE (3 posts) ============
  {
    slug: 'repair-vs-replace-engine',
    pillar: 'maintain',
    title: 'When to Repair vs Replace Your Engine: A $5,000 Decision Framework',
    excerpt: 'A clear-headed framework for the most expensive decision in car ownership — repair, swap, or scrap — with real cost ranges, the questions to ask before you sign, and the math that makes it obvious.',
    date: '2026-03-18',
    readingTime: '9 min read',
    body: `
<p>Your mechanic just used the words "the engine is going to need to come out." If you're the average driver, this is the most expensive sentence you'll hear all decade. It's also the moment most drivers make the wrong financial decision because they're being asked to choose between three options they don't fully understand.</p>

<p>Below is the framework. It works for any car, any engine, any era — and it'll save you from both the "fix it forever" mistake and the "trade it in tomorrow" mistake.</p>

<h2>The three options on the table</h2>

<p>Whatever the diagnosis, you really have three paths:</p>

<ol>
  <li><strong>Repair the existing engine.</strong> Replace the failed component (head gasket, timing chain, turbo, etc.) and reuse the rest of the engine. Cheapest option <em>if the rest of the engine is healthy</em>. Risky if the failure suggests broader internal damage.</li>
  <li><strong>Replace the engine.</strong> Swap in a remanufactured long-block or a low-mileage used engine from the same model year. Mid-cost, mid-risk. Resets the engine to "essentially new" without resetting the rest of the car.</li>
  <li><strong>Scrap or trade.</strong> Sell the car as-is or to a junk yard. Take the depreciation hit and walk away. Right answer when the rest of the car is also tired.</li>
</ol>

<h2>2026 cost ranges</h2>

<p>Numbers are realistic 2026 shop prices. Wide ranges because engine size, accessibility, and parts availability vary enormously.</p>

<h3>Repair the existing engine</h3>
<ul>
  <li>Head gasket repair (4-cylinder): <strong>$1,800–$3,200</strong></li>
  <li>Head gasket repair (V6/V8): <strong>$2,800–$4,800</strong></li>
  <li>Timing chain replacement (V6 with VVT): <strong>$2,400–$4,200</strong></li>
  <li>Turbo replacement (single turbo, modern car): <strong>$1,800–$3,400</strong></li>
  <li>Cylinder head rebuild: <strong>$2,200–$4,400</strong></li>
</ul>

<h3>Engine replacement</h3>
<ul>
  <li>Used engine from a salvage yard, installed: <strong>$3,200–$5,500</strong> for a 4-cylinder, <strong>$4,500–$7,800</strong> for a V6/V8</li>
  <li>Remanufactured engine, installed: <strong>$5,200–$8,800</strong> for a 4-cylinder, <strong>$7,500–$12,000</strong> for a V6/V8</li>
  <li>OEM new crate engine, installed (rare; mostly recent vehicles): <strong>$9,000–$18,000+</strong></li>
</ul>

<h2>The five questions that decide it</h2>

<p>Walk through these in order. They form a real decision tree.</p>

<h3>Q1: Is the rest of the car worth saving?</h3>

<p>Take a hard look at the body, frame, and other major systems. Specifically:</p>
<ul>
  <li>Transmission condition — when was it last serviced, any shift issues?</li>
  <li>Suspension — bushings, struts, control arms.</li>
  <li>Body — rust, especially on rocker panels and frame rails.</li>
  <li>Electronics — anything intermittent? ABS lights, infotainment glitches, instrument cluster issues?</li>
</ul>

<p>If any of these are also a meaningful repair away from being right, the engine isn't really the question. The car is. Skip to "scrap or trade."</p>

<h3>Q2: What's the car worth fixed?</h3>

<p>Look up <em>realistic</em> private-party value (not trade-in, not retail dealer ask) on a clean, mechanically sound version of your car. KBB, NADA, and recently completed listings on Cars.com or Marketplace are honest sources.</p>

<p>If the engine repair plus immediate other needed work is more than 60% of the fixed value, you're in dangerous territory. At 80%+, you're almost always better off scrapping.</p>

<h3>Q3: How long do you intend to keep this car?</h3>

<p>This is the question most owners skip and it's the most important one. Annualize the cost.</p>

<blockquote>$3,800 head gasket repair on a car you intend to keep 4 more years = $79/month. Compare that to a $390/month payment on a replacement. The repair is obvious — if you'll actually keep it 4 years.</blockquote>

<p>If you're going to trade it next year regardless, the math flips. Don't put $4,000 into a car you'll dump in 14 months.</p>

<h3>Q4: Was the failure preventable, and is it diagnostic of a broader pattern?</h3>

<p>Some engine failures are isolated. A timing chain that stretched at 110k on a 4-cylinder Subaru is a known failure mode and replacing it is the right answer. The engine is otherwise healthy.</p>

<p>Other failures are symptoms. A blown head gasket on a Northstar V8 is the engine telling you the next several thousand dollars are coming. A spun bearing usually means crankshaft damage and the cylinder walls beyond it. A burned valve on a turbo direct-injection 4-cylinder often means the rest of the valves are halfway there.</p>

<p>Ask the mechanic directly: "If I do this repair, what's the next likely failure on this engine, and at what mileage?" A good mechanic will tell you honestly. A vague or dodging answer is itself an answer.</p>

<h3>Q5: Is a clean used engine actually available?</h3>

<p>For common cars (Camry, Civic, Altima, F-150, Silverado, RAV4), used engines from salvage yards are abundant and the swap economics are great. For uncommon engines (any European V8, recent EV motor, JDM-only configurations, anything orphaned by manufacturer), the used market is thin and a swap may cost as much as a remanufactured option.</p>

<p>Get one quote on the repair, one quote on a used-engine swap (with explicit warranty terms), and one quote on a reman engine. The right answer is whichever has the best cost-per-future-year ratio combined with the best warranty.</p>

<h2>The "free option" that costs the most</h2>

<p>Some shops will offer to "open it up first and see what's needed." That's reasonable on a transmission. It's almost never reasonable on an engine.</p>

<p>An engine teardown by itself is 6–10 hours of labor. If you decide not to proceed, you're paying $900–$1,500 for an engine in pieces in a box. If you proceed, you've already committed to one shop's quote without comparison.</p>

<p>Better: get an opinion on the failure first (compression test, leakdown test, scan-tool data, oil analysis), three written quotes second, and only then authorize teardown.</p>

<h2>The honest decision tree</h2>

<p>If you want a single rule:</p>

<ol>
  <li>If the repair is &lt; 30% of the fixed value <em>and</em> you'll keep the car 2+ years <em>and</em> the rest of the car is solid — repair.</li>
  <li>If the repair is 30–60% and the car is otherwise excellent — consider an engine swap (used or reman) for the long warranty.</li>
  <li>If the repair is 60%+ <em>or</em> the car has multiple imminent issues <em>or</em> you're trading next year — scrap or trade.</li>
</ol>

<p>The wrong call here is almost always the emotional one — either "this car has been so good to me, of course I'll fix it" or "this car has betrayed me, get me out of it tomorrow." Neither of those is finance. They're feelings. Run the framework.</p>

<h2>Get three real quotes before you decide</h2>

<p>The single most important step is to <a href="/how-it-works.html">get three competitive quotes</a> on the same scope of work. Engine work has the widest pricing spread of any major repair — sometimes 2.5× between the high and low bid for the same job. The mechanic you trust most might also not be the cheapest, but you should know what cheapest looks like before deciding what "trust premium" you're paying.</p>

<p>This is the single most expensive automotive decision most drivers ever make. Spend an afternoon on it. The math will thank you for the next five years.</p>
    `,
    related: ['fair-brake-job-cost-2026', 'how-long-do-modern-cars-last', 'how-to-find-trustworthy-mechanic'],
  },

  {
    slug: 'oil-change-intervals-2026',
    pillar: 'maintain',
    title: 'Oil Change Intervals: What 2026 Manufacturers Actually Recommend (Not What the Quick-Lube Says)',
    excerpt: 'Modern engines don\'t need oil changes every 3,000 miles. They also don\'t always need them at the dashboard\'s 10,000-mile interval. Here\'s what the actual factory schedule says, and the rule that overrides both.',
    date: '2026-03-11',
    readingTime: '6 min read',
    body: `
<p>The 3,000-mile oil change is dead. It's been dead for 15 years. Yet roughly half of U.S. drivers still do it, mostly because the sticker on the windshield said so and the alternative felt vaguely irresponsible.</p>

<p>The truth is more useful than either extreme. Here's what 2026 manufacturers actually recommend, what conditions override that recommendation, and the one habit that matters more than any specific interval number.</p>

<h2>What the manufacturers actually say (2026 model year)</h2>

<p>These are factory-recommended intervals from owner's manuals, in normal driving conditions, for the most common 2026 models:</p>

<ul>
  <li><strong>Toyota (most models, 2.5L NA):</strong> 10,000 miles or 12 months</li>
  <li><strong>Toyota (turbo models including 2.4T):</strong> 5,000 miles or 6 months</li>
  <li><strong>Honda (2.0L NA):</strong> Indicated by Maintenance Minder, typically 7,500–10,000 miles</li>
  <li><strong>Honda (1.5T turbo):</strong> Indicated by Maintenance Minder, typically 5,000–7,500 miles</li>
  <li><strong>Hyundai/Kia:</strong> 7,500 miles or 12 months (severe schedule: 3,750 / 6 months)</li>
  <li><strong>Ford (2.7L Ecoboost / 3.5L Ecoboost):</strong> 7,500–10,000 miles per the Intelligent Oil-Life Monitor</li>
  <li><strong>BMW (modern N20/B48/B58):</strong> 10,000 miles or annual, per CBS — but enthusiast consensus is 7,500</li>
  <li><strong>Subaru (2.4L turbo):</strong> 6,000 miles or 6 months</li>
  <li><strong>Tesla / most EVs:</strong> No engine oil. Reduction-gear lube checked at 50,000 miles.</li>
  <li><strong>Diesel pickups (Cummins, Power Stroke, Duramax):</strong> 7,500–15,000 miles depending on fuel quality and duty cycle, with oil-life monitor as primary trigger</li>
</ul>

<h2>The "severe service" override most drivers actually qualify for</h2>

<p>Buried in every owner's manual is a "severe service" schedule. It cuts the recommended interval roughly in half. Read the conditions carefully — most of you will recognize yourselves:</p>

<ul>
  <li>Most trips under 10 miles in normal weather, or under 5 miles in cold weather</li>
  <li>Frequent stop-and-go driving</li>
  <li>Towing or heavy loads</li>
  <li>Driving in dusty conditions</li>
  <li>Extended idling (commercial, ride-share, delivery)</li>
  <li>Mountain driving or sustained high-speed driving</li>
</ul>

<p>If two or more of those describe most of your driving, you are a severe-service driver and the dashboard's "normal" interval is wrong for you. Halve it.</p>

<p>This is especially true for:</p>
<ol>
  <li><strong>Rideshare drivers</strong> — almost universally severe-service due to extended idling and frequent short trips. <a href="/rideshare.html">If you drive for Uber or Lyft</a>, oil change every 5,000 miles is the floor, not the ceiling.</li>
  <li><strong>Direct-injection turbocharged engines</strong> — fuel dilution and carbon buildup punish stretched oil intervals.</li>
  <li><strong>Cars driven less than 5,000 miles per year</strong> — time on the oil matters as much as miles. The 12-month interval applies even if you've only driven 1,800 miles.</li>
</ol>

<h2>What about full synthetic? Does it really last 10,000 miles?</h2>

<p>Full synthetic oil <em>can</em> last 10,000 miles in the right conditions. "Right conditions" means a healthy engine, normal-service driving, and a quality oil filter rated for the interval. In severe service it doesn't. Synthetic doesn't change the rate of fuel dilution, soot loading, or moisture intrusion — those are functions of how the engine is being used, not what's lubricating it.</p>

<p>Translation: synthetic is better at maintaining viscosity and resisting thermal breakdown, but it doesn't extend the interval if your driving pattern is the limiting factor.</p>

<h2>The rule that overrides everything</h2>

<p>Get an oil analysis once. Just one time, on your specific car, with your specific driving pattern. Blackstone Labs, Polaris, or any reputable lab will analyze a sample for $30–$45 and tell you exactly what the oil looked like at the end of the interval — total base number remaining, fuel dilution percentage, wear metals, oxidation level.</p>

<p>The result is conclusive. Either the oil was still in spec at the interval (and you can confidently use that interval going forward), or it wasn't (and you should shorten it). Either way, you're now operating on data, not someone else's marketing recommendation.</p>

<div class="callout callout-tip">
  <h3>One sample, ten years of confidence</h3>
  <p>Get the sample taken at your next oil change. Most quick-lube shops will draw a sample for free if you bring the bottle. Mail it in. The report comes back in a week. You'll know your engine.</p>
</div>

<h2>Oil change pricing in 2026</h2>

<p>So you're not overpaying:</p>
<ul>
  <li>Conventional oil change (diesel pickup or older car): <strong>$45–$70</strong></li>
  <li>Synthetic-blend oil change (most cars): <strong>$60–$90</strong></li>
  <li>Full synthetic, 5–6 quarts (most modern cars): <strong>$75–$110</strong></li>
  <li>Full synthetic, 7+ quarts (V8 trucks, some SUVs): <strong>$95–$145</strong></li>
  <li>European spec (BMW, Mercedes, Audi — long-life synthetic): <strong>$110–$180</strong></li>
</ul>

<p>If you're being quoted $200+ for a routine oil change on a non-European car, ask what's actually included. Sometimes legit (multi-point inspection, fluid top-offs, tire rotation). Sometimes overpriced.</p>

<h2>The bottom line</h2>

<p>Modern oil and modern engines together really did kill the 3,000-mile interval. But the dashboard's 10,000-mile assumption is also wrong for a meaningful share of drivers. The honest answer is: read your manual, identify whether your driving qualifies as severe service, and if you're not sure, send a sample to a lab once.</p>

<p>$30 to know for sure beats $300 in unnecessary oil changes per year, and beats $5,000 in premature engine wear by an even wider margin. Worth doing once.</p>
    `,
    related: ['repair-vs-replace-engine', 'how-long-do-modern-cars-last', 'obd-ii-codes-explained'],
  },

  {
    slug: 'obd-ii-codes-explained',
    pillar: 'maintain',
    title: 'OBD-II Codes Explained: The 10 Most Common Engine Lights and What They Cost to Fix',
    excerpt: 'Your check-engine light is on. Before you panic — or pay a shop $150 just to read the code — here\'s what the 10 most common OBD-II codes actually mean and what fixing them really costs.',
    date: '2026-03-04',
    readingTime: '8 min read',
    body: `
<p>The check-engine light is the most stress-inducing dashboard symbol in modern car ownership. It's vague on purpose — the same yellow light covers everything from "your gas cap is loose" to "your catalytic converter is failing and the fix is $1,800."</p>

<p>The good news: every check-engine light comes with a specific OBD-II code that narrows the field instantly. The better news: a $25 reader plugged into the port under your dash gets you that code in 30 seconds, exactly the same one a shop would charge $130 to read.</p>

<p>Here's what the most common ones actually mean.</p>

<h2>How to read the code yourself</h2>

<p>You need three things: a Bluetooth OBD-II reader (or a standalone unit — both work), the free Torque Lite or Car Scanner app on your phone, and the OBD-II port — almost always within 12 inches of your steering column under the dash.</p>

<ol>
  <li>Plug the reader in. Turn the key to "on" but don't start the engine.</li>
  <li>Connect the app to the reader.</li>
  <li>Read codes. Each code is a letter (P, B, C, U) plus four digits. P-codes are powertrain — the most common.</li>
</ol>

<p>You can also clear codes from the same screen. Don't do this without writing the code down first — a shop needs the original code to diagnose properly.</p>

<h2>The 10 most common codes, what they mean, and what they cost</h2>

<h3>P0420 — Catalyst System Efficiency Below Threshold (Bank 1)</h3>
<p><strong>What it usually means:</strong> The catalytic converter is no longer reducing emissions efficiently. Sometimes the converter itself is failing; sometimes an oxygen sensor is reading wrong.</p>
<p><strong>Real-world fix cost:</strong></p>
<ul>
  <li>Replace front O2 sensor first (often the actual problem): <strong>$180–$320</strong></li>
  <li>If sensor doesn't fix it, replace catalytic converter: <strong>$900–$2,400</strong> aftermarket; <strong>$1,800–$4,200</strong> OEM</li>
</ul>
<p><strong>Important:</strong> Always replace the upstream O2 sensor first. Throwing a $1,800 converter at a $220 sensor problem is one of the most common car-repair mistakes.</p>

<h3>P0171 / P0174 — System Too Lean (Bank 1 / Bank 2)</h3>
<p><strong>What it usually means:</strong> The engine is running with too much air relative to fuel. Often a vacuum leak, dirty mass airflow sensor, or failing fuel pump.</p>
<p><strong>Real-world fix cost:</strong></p>
<ul>
  <li>MAF sensor cleaning: <strong>$15</strong> (DIY with MAF cleaner spray)</li>
  <li>MAF sensor replacement: <strong>$120–$340</strong></li>
  <li>Vacuum hose / intake gasket repair: <strong>$160–$480</strong></li>
  <li>Fuel pump replacement: <strong>$480–$1,100</strong></li>
</ul>
<p>Always start with the cheap fixes. Half of these codes resolve with $15 of MAF cleaner.</p>

<h3>P0300 / P030X — Random / Cylinder X Misfire</h3>
<p><strong>What it usually means:</strong> One or more cylinders aren't firing properly. Single cylinder code (P0301, P0302, etc.) points at that specific cylinder. Could be ignition, fuel, or compression-related.</p>
<p><strong>Real-world fix cost:</strong></p>
<ul>
  <li>Spark plug replacement (set of 4–8): <strong>$80–$280</strong></li>
  <li>Single coil pack replacement: <strong>$140–$340</strong></li>
  <li>Fuel injector replacement: <strong>$260–$640</strong></li>
  <li>Compression issue (head gasket, valves): <strong>$1,800+</strong></li>
</ul>
<p><strong>Do not ignore.</strong> Sustained misfire damages catalytic converters, which is how a $90 spark plug job becomes a $2,200 cat job.</p>

<h3>P0455 / P0456 / P0442 — Evaporative Emission System Leak</h3>
<p><strong>What it usually means:</strong> The system that captures fuel-tank vapors has a leak. Most often: a loose, missing, or worn-out gas cap. Sometimes a cracked vacuum line or failing purge valve.</p>
<p><strong>Real-world fix cost:</strong></p>
<ul>
  <li>New gas cap: <strong>$15–$35</strong> (try this first, drive 50 miles, see if light clears)</li>
  <li>Purge valve replacement: <strong>$120–$280</strong></li>
  <li>Charcoal canister replacement: <strong>$280–$680</strong></li>
</ul>
<p>This is the lowest-stakes code on this list. A loose gas cap really does throw it. Tighten the cap, drive a few days, see what happens.</p>

<h3>P0128 — Coolant Temperature Below Thermostat Regulating Temperature</h3>
<p><strong>What it usually means:</strong> The engine isn't reaching operating temperature. Usually a stuck-open thermostat.</p>
<p><strong>Real-world fix cost:</strong> Thermostat replacement <strong>$180–$420</strong>.</p>

<h3>P0440 — Evaporative Emission Control System Malfunction</h3>
<p>Generic version of the P0455/P0456 family. Same starting point: gas cap.</p>

<h3>P0700 — Transmission Control System Malfunction</h3>
<p><strong>What it usually means:</strong> Generic flag that something in the transmission control system has tripped. Almost always paired with a more specific transmission code (P07XX). Don't act on P0700 alone — get the secondary code.</p>
<p><strong>Real-world fix cost:</strong> Anywhere from a $180 fluid service to a $4,200 rebuild. Cannot diagnose without the secondary code.</p>

<h3>P0011 / P0014 — Camshaft Position Timing Over-Advanced (Bank 1)</h3>
<p><strong>What it usually means:</strong> Variable valve timing solenoid problem, dirty oil obstructing the VVT system, or a failing timing chain tensioner.</p>
<p><strong>Real-world fix cost:</strong></p>
<ul>
  <li>Oil change with proper-spec synthetic (sometimes the only fix): <strong>$80–$120</strong></li>
  <li>VVT solenoid replacement: <strong>$220–$540</strong></li>
  <li>Timing chain / tensioner replacement: <strong>$1,800–$3,400</strong></li>
</ul>

<h3>P0301–P0308 — Specific Cylinder Misfire</h3>
<p>Same diagnosis as P0300 but you already know which cylinder. Saves diagnostic time.</p>

<h3>P0401 — Insufficient EGR Flow</h3>
<p><strong>What it usually means:</strong> The Exhaust Gas Recirculation valve is clogged with carbon, or the EGR passage is restricted.</p>
<p><strong>Real-world fix cost:</strong></p>
<ul>
  <li>EGR valve cleaning: <strong>$160–$320</strong> labor</li>
  <li>EGR valve replacement: <strong>$240–$540</strong></li>
</ul>

<h2>"Pending" vs "Active" codes</h2>

<p>Modern OBD-II distinguishes between pending codes (the system saw a fault once and is monitoring) and active codes (the fault has been confirmed across multiple drive cycles). A pending code with no active code usually doesn't trigger the dash light — it's just a warning that something is being watched. Don't panic about pending codes. Don't ignore active ones.</p>

<h2>When the light is flashing, not solid</h2>

<p>A <em>flashing</em> check-engine light is materially worse than a steady one. It almost always means a severe misfire that's actively damaging the catalytic converter. Pull over safely, reduce load, get the car towed if you're far from home. Don't drive on a flashing CEL — every mile is meaningfully expensive.</p>

<h2>The $25 investment that saves $130 every time</h2>

<p>A basic Bluetooth OBD-II reader is $20–$30 on Amazon. The Torque Lite app is free. Your check-engine light goes on, you read the code in 60 seconds, you Google what it means, you decide whether it's a "drive to the shop" or "park it" situation. That decision-making power saves the $130 diagnostic fee every time, plus removes the stress of not knowing.</p>

<p>If the code is real and you need work done, <a href="/how-it-works.html">post the job</a> with the specific code and let qualified providers quote it. "P0420 on a 2018 Camry" gets you accurate quotes in hours instead of "my check engine light is on" getting you a wide range of guesses.</p>

<p>The check-engine light isn't a mystery anymore. It's a code, a Google search, and a decision. The 30 minutes it takes to learn this once is the best return on time in all of car ownership.</p>
    `,
    related: ['oil-change-intervals-2026', 'repair-vs-replace-engine', 'vin-decoder-guide'],
  },

  // ============ PILLAR 4: SHOP SMARTER (2 posts) ============
  {
    slug: 'used-car-buying-checklist',
    pillar: 'shop',
    title: 'Used Car Buying Checklist: 27 Things to Inspect Before You Sign',
    excerpt: 'A field-tested 27-point inspection you can do in 45 minutes — no special tools — that catches the problems that cost real money. Plus the three deal-breakers most buyers miss.',
    date: '2026-02-25',
    readingTime: '9 min read',
    body: `
<p>A used car costs you twice: once at purchase, and once in everything you didn't catch on the test drive. The second cost is usually larger than the first. The single highest-value 45 minutes you'll spend in any used-car transaction is a methodical pre-purchase walk-through using the same checklist a shop would use — minus the diagnostic equipment.</p>

<p>Here's the 27-point version. Bring a flashlight, a notepad, and a magnet (for cheap rust detection). Skip nothing.</p>

<h2>Before you arrive</h2>

<ol>
  <li><strong>Decode the VIN.</strong> Get the exact build, options, and engine. Confirms the seller's listing matches reality. (See our <a href="/blog/vin-decoder-guide.html">VIN decoder guide</a> for the full process.)</li>
  <li><strong>Run the recall check at nhtsa.gov.</strong> Open recalls are red flags only if they're safety-critical and unaddressed.</li>
  <li><strong>Pull the title history.</strong> Carfax or AutoCheck. Look for clean title, gap-free ownership timeline, no salvage/flood/lemon brands.</li>
  <li><strong>Confirm the asking price is in the right range</strong> on KBB / NADA / completed Marketplace listings for the same year, trim, and mileage band.</li>
</ol>

<h2>Exterior — 5 minutes</h2>

<ol start="5">
  <li><strong>Body panel alignment.</strong> Stand at each corner and look down the side. Doors, fenders, hood, and trunk should have consistent gaps. Mismatches mean prior collision repair.</li>
  <li><strong>Paint variation.</strong> Check in direct sunlight from multiple angles. Look for color shift between adjacent panels — even subtle. Replacement panels are very hard to color-match perfectly.</li>
  <li><strong>Frame rail rust.</strong> Get under the car. Bring the magnet. Run it along the frame rails. If it doesn't stick somewhere it should, that's body filler over corrosion. Walk away.</li>
  <li><strong>Rocker panel rust.</strong> The strip under the doors. Press firmly. Soft = structural rust progressing to perforation.</li>
  <li><strong>Tire wear pattern.</strong> Even wear across all four = healthy alignment. Inner-edge or outer-edge wear = alignment issue. Cupped/scalloped wear = worn suspension. Different tire brands across the same axle = budget previous owner.</li>
  <li><strong>Tire date code.</strong> The 4-digit DOT code on each tire's sidewall: WWYY (week/year). Tires older than 6 years are dry-rotting even if tread looks fine.</li>
</ol>

<h2>Interior — 5 minutes</h2>

<ol start="11">
  <li><strong>Driver's seat bolster wear.</strong> Should match the odometer. Heavy bolster wear on a low-mileage car is the #1 odometer-rollback signal.</li>
  <li><strong>Pedal rubber wear.</strong> Same logic. Worn-down pedals on a 28k-mile car is a problem.</li>
  <li><strong>Steering wheel polish.</strong> Bright shiny spots at 9 and 3 are honest mileage. A "low-mileage" car with a polished wheel is lying.</li>
  <li><strong>Carpet inspection — pull it back.</strong> Particularly under the rear seat and in the trunk. Water staining or rust on metal underneath = flood damage.</li>
  <li><strong>Smell test.</strong> Mildew, mold, or excessive air freshener masking something. All bad signs.</li>
  <li><strong>All electronics, exercised.</strong> Every window, every mirror, every seat motor, every light, every switch. The HVAC across all temperatures. Heated seats. Sunroof through full range. The infotainment system Bluetooth-pairing. Headlight high beams. Hazards. Anything that doesn't work today won't work cheaply later.</li>
</ol>

<h2>Engine bay — 5 minutes</h2>

<ol start="17">
  <li><strong>Oil dipstick.</strong> Should be amber to dark brown, not black sludge. No metal flake on the bottom. Rim of the dipstick tube should not have sludge buildup.</li>
  <li><strong>Coolant.</strong> Should be the correct color (green, orange, pink — depends on car) and clean. Brown, oily, or rust-colored coolant means contamination.</li>
  <li><strong>Oil cap underside.</strong> A milky, mayonnaise-textured residue under the cap is moisture — could be short-trip driving, could be head gasket. Investigate.</li>
  <li><strong>Hose condition.</strong> Squeeze the major coolant hoses. They should be firm. Crunchy or mushy = past replacement interval.</li>
  <li><strong>Belt condition.</strong> Cracks, glazing, or shiny edges = needs replacement soon ($120–$300 job).</li>
  <li><strong>Visible leaks.</strong> Look at the ground under the car after it's been parked for hours. Drips of any kind warrant questions.</li>
</ol>

<h2>Test drive — 15 minutes minimum</h2>

<ol start="23">
  <li><strong>Cold start.</strong> Insist on starting the car cold. Listen for excessive noise, knocks, ticking that doesn't quiet within 30 seconds. White smoke from the exhaust on a warmed-up engine = head gasket.</li>
  <li><strong>Brake test.</strong> On an empty stretch, brake firmly from 35 mph. The car should stop straight without pulling. No pulsation through the pedal. No grinding.</li>
  <li><strong>Acceleration through gears.</strong> Should shift cleanly without flaring (RPMs jumping before the gear engages) or harsh slamming. CVTs should pull smoothly without rubber-banding feel.</li>
  <li><strong>Highway test.</strong> Get to highway speed for at least 5 minutes. Listen for wind noise, road noise, vibration through the steering wheel. Light vibration at 60–70 mph = often unbalanced wheels (cheap fix). Heavy vibration = potentially a CV joint or driveshaft (expensive).</li>
  <li><strong>Parking lot maneuvers.</strong> Full lock left and right at low speed. Clicks or pops = CV joint failure. Groaning = power steering problem.</li>
</ol>

<h2>The three deal-breakers most buyers miss</h2>

<p>Even with the checklist above, three issues catch most amateur buyers. Be paranoid about these specifically:</p>

<h3>Deal-breaker 1: Frame damage that wasn't disclosed</h3>
<p>A "clean Carfax" doesn't always mean clean. Insurance-paid repairs and out-of-pocket repairs that didn't go through a shop are invisible to title services. Always look for evidence yourself: panel-gap inconsistency, paint variation, fresh undercoating spray (used to hide repaired metal).</p>

<h3>Deal-breaker 2: A rebuilt or salvage title sold as clean</h3>
<p>Almost always state-line fraud — washing the title in a state with looser rules. Verify the title in person against the seller's ID. Check the title is in the seller's name. Confirm the title brand (clean, salvage, rebuilt, flood) is exactly what was advertised.</p>

<h3>Deal-breaker 3: Open recalls with safety implications</h3>
<p>Some recalls remain open because parts aren't available. A 2017–2020 Hyundai/Kia with the open theta engine recall is a different car than the listing suggests. Run the VIN against nhtsa.gov before you write a check.</p>

<h2>The single best protection: the pre-purchase inspection (PPI)</h2>

<p>Spending $130–$220 on a pre-purchase inspection at an independent shop the seller didn't recommend is the highest-ROI car-buying decision you can make. Find a shop yourself, drive the car there (or have it dropped off), let them put it on a lift, scan for codes, and check what you can't see from the ground.</p>

<p>If the seller refuses, walk. The refusal is the inspection result.</p>

<p>For finding a trustworthy independent shop near the seller, <a href="/providers-directory.html">browse vetted providers in that area</a> — every provider on My Car Concierge has been background-checked and has a public review history. A 30-minute conversation, a 45-minute inspection, and you'll know within an hour whether the car is what it says it is.</p>

<h2>The one-page version</h2>

<p>If you remember nothing else: <strong>VIN check first, walk-around with a magnet second, cold start before test drive, full cycle of every electronic accessory, independent PPI before signing.</strong></p>

<p>The 27-point checklist takes 45 minutes. The wrong used car costs years. The math is obvious.</p>
    `,
    related: ['vin-decoder-guide', 'how-to-find-trustworthy-mechanic', 'extended-warranty-vs-repair-fund'],
  },

  {
    slug: 'extended-warranty-vs-repair-fund',
    pillar: 'shop',
    title: 'Extended Warranty vs Repair Fund: Which Actually Saves You Money?',
    excerpt: 'The honest math on extended warranties — when they win, when self-insuring beats them, and the four contract terms that decide the answer for your specific car.',
    date: '2026-02-18',
    readingTime: '7 min read',
    body: `
<p>Every used-car salesperson sells extended warranties because they're high-margin products. That doesn't automatically make them a bad deal — it just means the seller's incentives aren't aligned with yours. To know whether the warranty in front of you is the right call, you have to do the math yourself.</p>

<p>Below is the framework. By the end you'll be able to look at any specific extended warranty and know — within a few minutes — whether it's worth the price.</p>

<h2>The two real options</h2>

<p>Either you buy an extended warranty (formally a Vehicle Service Contract, or VSC) for a one-time fee, or you "self-insure" by setting aside the same money in a savings account and using it to pay for repairs as they come.</p>

<p>Most owners do neither. They put nothing aside and absorb repair surprises onto a credit card. That's the worst of all options. Pick one of the two real ones.</p>

<h2>The math, in one paragraph</h2>

<p><strong>Extended warranty wins when:</strong> the contract pays out more in covered claims than you pay in premiums plus deductibles, accounting for what you would have earned on the same money sitting in a high-yield savings account.</p>

<p><strong>Self-insurance wins when:</strong> the warranty's combined load (administrator's profit margin, the dealer's commission, claim-denial rate) eats more than the cost of the actual repairs you'd absorb, on average, over the contract period.</p>

<p>The honest answer for most cars is that self-insurance wins, but not by as much as warranty critics claim, and not at all for certain specific cars. Your job is to figure out which side of the line your situation is on.</p>

<h2>The four contract terms that decide it</h2>

<p>Before signing any extended warranty, you must understand four things. The marketing brochure won't make these obvious. The contract — the actual contract — will.</p>

<h3>1. Exclusionary or stated-component coverage?</h3>

<p>An <strong>exclusionary</strong> contract covers everything <em>except</em> what's explicitly excluded. Better for the buyer.</p>

<p>A <strong>stated-component</strong> (also called "named-component" or "powertrain-plus") contract only covers what's explicitly listed. Worse for the buyer — and the contract often lists things in a way that excludes the actual most likely failures. ("Fuel system" might cover the fuel pump but not the high-pressure fuel pump that's actually most likely to fail on direct-injection engines.)</p>

<p>Always ask which type. If the seller can't answer in five seconds, walk.</p>

<h3>2. Wear-and-tear vs mechanical breakdown?</h3>

<p>Some contracts only pay when a component "fails" — meaning, breaks completely. Other contracts pay when a component "wears below operating tolerance" — a much friendlier definition that triggers earlier and pays for more repairs.</p>

<p>This single distinction often decides whether a $1,400 transmission service is covered or denied.</p>

<h3>3. The deductible structure</h3>

<p>Two real flavors:</p>
<ul>
  <li><strong>Per-visit deductible.</strong> You pay $100 (or whatever) per visit, regardless of how many separate problems are diagnosed. Better for buyer.</li>
  <li><strong>Per-component deductible.</strong> You pay the deductible for each separately covered failure on the same visit. Worse — turns one visit into multiple deductibles fast.</li>
</ul>

<h3>4. What's required to keep coverage in force</h3>

<p>Extended warranties get denied for surprising reasons. Common requirements that void coverage if not followed:</p>
<ul>
  <li>Every oil change must be performed at the manufacturer-spec interval, with a receipt that shows the exact oil weight and viscosity.</li>
  <li>All scheduled maintenance must be documented to the warranty's terms, not the manufacturer's.</li>
  <li>Modifications (tunes, exhaust, lift kits) typically void coverage — sometimes for unrelated systems.</li>
  <li>Some contracts require pre-authorization for any repair over a dollar threshold; failure to get pre-auth means denial, even if the repair was covered.</li>
</ul>

<p>Read the maintenance and pre-authorization sections specifically. Half of warranty denials happen here, not at the coverage definition.</p>

<h2>The "cars where extended warranty actually wins" list</h2>

<p>Not every car is the same. The following are situations where an extended warranty mathematically wins for the average buyer:</p>

<ul>
  <li><strong>European luxury under warranty.</strong> Audi, BMW, Mercedes — repair costs are high enough that even a 30% claim-paid rate beats self-insurance. CPO (Certified Pre-Owned) coverage extensions are usually a good buy on these.</li>
  <li><strong>Cars with known-failure powertrains under recall watch.</strong> First-generation Ecoboost trucks, certain Hyundai/Kia theta engines, any model year with a class-action lawsuit. The risk is non-normal.</li>
  <li><strong>Cars you're financing for 7 years.</strong> The loan term outlasts the factory warranty by 3+ years. Either an extended warranty or a serious repair fund is the right answer; not both.</li>
  <li><strong>Cars with rare or expensive parts.</strong> Tesla Model S/X, Range Rover, exotic sedans, anything where one part exceeds $4,000.</li>
</ul>

<h2>The "self-insure instead" list</h2>

<ul>
  <li><strong>Toyota / Honda / Mazda naturally aspirated 4-cylinder.</strong> Repair frequency low enough that warranty premiums almost always exceed lifetime claims.</li>
  <li><strong>Most American sedans.</strong> Ford Fusion, Chevy Malibu, Buick — parts cheap, labor moderate.</li>
  <li><strong>Older cars (8+ years).</strong> Coverage gets worse and premiums get higher as the car ages. Self-insurance becomes the obvious winner.</li>
  <li><strong>Cars you intend to keep less than 3 years.</strong> The warranty is amortized over too short a period to win.</li>
</ul>

<h2>The repair-fund math</h2>

<p>If you choose to self-insure, here's how to size it. Take the average annual repair cost for your specific car (RepairPal and CarMD publish reliable averages by make/model) and put 1.5× that in a high-yield savings account dedicated to the car. For most mainstream vehicles, that's $700–$1,400. Re-fill it every year. After 3–4 years you'll have built a buffer that handles even severe events.</p>

<p>The $1,200 you didn't spend on a warranty earns 4.5% in a high-yield account — over 4 years, that's another $230 you didn't spend, either. The compounding matters.</p>

<h2>The negotiation play</h2>

<p>If you do decide a warranty makes sense for your specific situation:</p>

<ol>
  <li><strong>Never buy at the time of vehicle purchase.</strong> The dealer's offer is always 2–3× higher than the same warranty bought from the same administrator a few weeks later, direct.</li>
  <li><strong>Get three quotes from independent providers.</strong> CARCHEX, Endurance, and Olive are reasonable starting points. You'll see the spread immediately.</li>
  <li><strong>Negotiate the deductible and the term separately.</strong> The published price assumes the worst-for-you defaults. Lowering the deductible is usually cheaper than the dealer claims; shortening the term is usually a much better value than extending it.</li>
</ol>

<h2>The bottom line</h2>

<p>Extended warranties are not scams. They are over-priced for most buyers, over-sold to all buyers, and exactly right for a specific minority. Whether you're in that minority depends on the car you own, the contract terms in front of you, and how disciplined you'd be at funding a repair fund instead.</p>

<p>If you're going to self-insure, do it for real — open the savings account today and fund it. If you're going to buy a warranty, read the four-paragraph contract terms above before you sign. Either is a real plan. Doing neither is the only mistake worth avoiding.</p>

<p>For the actual repair quotes you'll need either way, <a href="/how-it-works.html">post the job on My Car Concierge</a> and compare bids transparently. Knowing what repairs really cost is what makes the warranty math work in either direction.</p>
    `,
    related: ['repair-vs-replace-engine', 'used-car-buying-checklist', 'how-to-compare-auto-repair-quotes'],
  },
];

// ----------------------------------------------------------------------------
// HTML rendering
// ----------------------------------------------------------------------------

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function jsonLdForPost(post) {
  const url = `${SITE}/blog/${post.slug}.html`;
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: post.title,
    description: post.excerpt,
    image: OG_IMAGE,
    datePublished: post.date,
    dateModified: post.date,
    author: { '@type': 'Organization', name: SITE_NAME, url: SITE },
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    articleSection: PILLARS[post.pillar].label,
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home',  item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog',  item: `${SITE}/blog/` },
      { '@type': 'ListItem', position: 3, name: post.title, item: url },
    ],
  };
  return `<script type="application/ld+json">${JSON.stringify(articleLd)}</script>
<script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>`;
}

function relatedPostsHtml(post) {
  if (!post.related || !post.related.length) return '';
  const items = post.related
    .map(slug => POSTS.find(p => p.slug === slug))
    .filter(Boolean)
    .map(p => `<li><a href="/blog/${p.slug}.html">${escapeHtml(p.title)}</a></li>`)
    .join('\n        ');
  return `
  <section class="blog-more">
    <div class="blog-container">
      <h3>More from the blog</h3>
      <ul>
        ${items}
      </ul>
    </div>
  </section>`;
}

function postHtml(post) {
  const url = `${SITE}/blog/${post.slug}.html`;
  const pillar = PILLARS[post.pillar];
  const dateLong = new Date(post.date + 'T12:00:00Z').toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  const head = `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(post.title)} – My Car Concierge Blog</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="description" content="${escapeHtml(post.excerpt)}" />
  <meta name="theme-color" content="#12161c" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="My Car Concierge" />
  <script>
    (function() {
      var theme = localStorage.getItem('theme') || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
    })();
  </script>
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-96.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/shared-styles.css" />
  <link rel="stylesheet" href="/blog/blog.css" />
  ${jsonLdForPost(post)}
</head>`;

  const body = `
<body class="blog-body">
  <div class="ambient-bg"></div>
  <div class="noise"></div>

  <header class="blog-header">
    <div class="header-inner">
      <a href="/" class="blog-brand">
        <img src="/logo.png" alt="My Car Concierge" />
      </a>
      <nav class="blog-nav">
        <a href="/">Home</a>
        <a href="/blog/" class="active">Blog</a>
        <a href="/how-it-works.html">How It Works</a>
        <a href="/providers-directory.html">Find a Provider</a>
        <a href="/onboarding-member.html" class="btn-cta">Get a Quote</a>
      </nav>
    </div>
  </header>

  <main>
    <div class="blog-container">
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="/">Home</a><span class="sep">/</span><a href="/blog/">Blog</a><span class="sep">/</span><span>${escapeHtml(post.title)}</span>
      </nav>

      <header class="blog-hero">
        <span class="pillar-tag" style="color:${pillar.color};border-color:${pillar.color}40;background:${pillar.color}1f">${pillar.label}</span>
        <h1>${escapeHtml(post.title)}</h1>
        <div class="meta">
          <span><strong>${escapeHtml(AUTHOR)}</strong></span>
          <span class="dot"></span>
          <span>${dateLong}</span>
          <span class="dot"></span>
          <span>${post.readingTime}</span>
        </div>
      </header>

      <article class="blog-article">
${post.body.trim()}

        <div class="blog-cta">
          <h3>Ready to put this into practice?</h3>
          <p>Post your job once and let vetted providers compete for it. Side-by-side quotes, real reviews, secure payments.</p>
          <div class="cta-buttons">
            <a href="/onboarding-member.html" class="btn btn-primary">Get a Quote</a>
            <a href="/providers-directory.html" class="btn btn-secondary">Browse Providers</a>
          </div>
        </div>
      </article>
    </div>
${relatedPostsHtml(post)}
  </main>

  <script src="/footer.js"></script>
</body>
</html>`;

  return head + body;
}

function indexHtml() {
  const sorted = [...POSTS].sort((a, b) => b.date.localeCompare(a.date));
  const cards = sorted.map(p => {
    const pillar = PILLARS[p.pillar];
    const dateShort = new Date(p.date + 'T12:00:00Z').toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    return `      <a class="post-card" href="/blog/${p.slug}.html">
        <div class="pillar" style="color:${pillar.color}">${pillar.label}</div>
        <h2>${escapeHtml(p.title)}</h2>
        <p class="excerpt">${escapeHtml(p.excerpt)}</p>
        <div class="post-meta">
          <span>${dateShort}</span>
          <span class="dot"></span>
          <span>${p.readingTime}</span>
        </div>
      </a>`;
  }).join('\n');

  // Blog landing page JSON-LD: Blog + BreadcrumbList
  const blogLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: 'My Car Concierge Blog',
    url: `${SITE}/blog/`,
    description: 'Plain-spoken guides on auto care, smart car shopping, and getting fair quotes — from the team behind My Car Concierge.',
    publisher: {
      '@type': 'Organization',
      name: SITE_NAME,
      logo: { '@type': 'ImageObject', url: `${SITE}/logo.png` },
    },
    blogPost: sorted.map(p => ({
      '@type': 'BlogPosting',
      headline: p.title,
      url: `${SITE}/blog/${p.slug}.html`,
      datePublished: p.date,
      author: { '@type': 'Organization', name: SITE_NAME },
    })),
  };
  const breadcrumbLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE}/` },
      { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE}/blog/` },
    ],
  };

  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <title>The My Car Concierge Blog — Auto Care, Quotes, and Smart Shopping</title>
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="description" content="Plain-spoken guides on auto care, smart car shopping, and getting fair repair quotes — from the team behind My Car Concierge." />
  <meta name="theme-color" content="#12161c" />
  <script>
    (function() {
      var theme = localStorage.getItem('theme') || 'dark';
      document.documentElement.setAttribute('data-theme', theme);
    })();
  </script>
  <link rel="manifest" href="/manifest.json" />
  <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="/icons/icon-192.png" />
  <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-96.png" />
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600;700&family=Playfair+Display:wght@500;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/shared-styles.css" />
  <link rel="stylesheet" href="/blog/blog.css" />
  <script type="application/ld+json">${JSON.stringify(blogLd)}</script>
  <script type="application/ld+json">${JSON.stringify(breadcrumbLd)}</script>
</head>
<body class="blog-body">
  <div class="ambient-bg"></div>
  <div class="noise"></div>

  <header class="blog-header">
    <div class="header-inner">
      <a href="/" class="blog-brand">
        <img src="/logo.png" alt="My Car Concierge" />
      </a>
      <nav class="blog-nav">
        <a href="/">Home</a>
        <a href="/blog/" class="active">Blog</a>
        <a href="/how-it-works.html">How It Works</a>
        <a href="/providers-directory.html">Find a Provider</a>
        <a href="/onboarding-member.html" class="btn-cta">Get a Quote</a>
      </nav>
    </div>
  </header>

  <main>
    <div class="blog-container wide">
      <nav class="breadcrumbs" aria-label="Breadcrumb">
        <a href="/">Home</a><span class="sep">/</span><span>Blog</span>
      </nav>
      <section class="blog-index-hero">
        <span class="pillar-tag">From the Team</span>
        <h1>The My Car Concierge Blog</h1>
        <p>Plain-spoken guides on auto care, smart car shopping, and getting fair repair quotes — written by people who actually love what they drive.</p>
      </section>

      <section class="post-grid">
${cards}
      </section>
    </div>
  </main>

  <script src="/footer.js"></script>
</body>
</html>`;
}

// ----------------------------------------------------------------------------
// Write
// ----------------------------------------------------------------------------

if (!fs.existsSync(BLOG_DIR)) fs.mkdirSync(BLOG_DIR, { recursive: true });

let written = 0;
for (const post of POSTS) {
  const out = path.join(BLOG_DIR, `${post.slug}.html`);
  fs.writeFileSync(out, postHtml(post), 'utf8');
  written++;
}
fs.writeFileSync(path.join(BLOG_DIR, 'index.html'), indexHtml(), 'utf8');

console.log(`✓ Wrote ${written} blog posts + index.html into www/blog/`);
console.log(`Posts by pillar:`);
const byPillar = {};
POSTS.forEach(p => { byPillar[p.pillar] = (byPillar[p.pillar] || 0) + 1; });
Object.entries(byPillar).forEach(([k, v]) => console.log(`  ${PILLARS[k].label}: ${v}`));

// Export POSTS so other scripts (sitemap, seo-injector) can reuse the metadata
module.exports = { POSTS, PILLARS };
