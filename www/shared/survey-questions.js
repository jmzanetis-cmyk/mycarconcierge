/* ==========================================================================
   My Car Concierge — Member Survey: Single Source of Truth
   --------------------------------------------------------------------------
   This file is the ONE place that defines the post-signup survey:
     • The questions and answer options shown in onboarding-member.html
     • The ALLOWED enum map used by POST /api/member/survey in server.js
     • The display labels used by admin.js (Member Survey Analytics charts)

   If you add, remove, or rename a question or option, edit ONLY this file.
   The form, the server validator, and the admin labels will all stay aligned.

   Loading:
     • Browser: <script src="shared/survey-questions.js"></script> exposes
       a global `MCCSurvey` with { QUESTIONS, ALLOWED, LABELS, KEYS }.
     • Node.js: `const MCCSurvey = require('./shared/survey-questions');`

   Per-option fields:
     • val        — canonical enum value persisted to the DB. Never change
                    once shipped (would break historical analytics).
     • label      — sentence shown to members in the signup survey.
     • adminLabel — short label used in admin charts/legends. Optional;
                    falls back to `label` when omitted.
   ========================================================================== */

(function (root, factory) {
  'use strict';
  const mod = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = mod;
  } else {
    root.MCCSurvey = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const QUESTIONS = [
    {
      key: 'provider_discovery',
      tag: 'Question 1 of 22',
      q: 'How do you typically find auto service providers — mechanics, detailers, body shops?',
      opts: [
        { val: 'word_of_mouth', label: 'Word of mouth from friends or family', adminLabel: 'Word of mouth' },
        { val: 'google_search', label: 'Google search and reviews', adminLabel: 'Google search' },
        { val: 'social_media', label: 'Social media (Facebook, Instagram, TikTok, etc.)', adminLabel: 'Social media' },
        { val: 'ad', label: 'Saw an ad somewhere', adminLabel: 'Advertising' },
        { val: 'app_store', label: 'Found through an app store', adminLabel: 'App store' },
        { val: 'other', label: 'Other / I stick with providers I already know', adminLabel: 'Other' }
      ]
    },
    {
      key: 'provider_satisfaction',
      tag: 'Question 2 of 22',
      q: 'Overall, how satisfied are you with the auto service providers you currently use?',
      opts: [
        { val: 'very_satisfied', label: 'Very satisfied — I have reliable providers I trust', adminLabel: 'Very satisfied' },
        { val: 'somewhat_satisfied', label: "Somewhat satisfied — they're good enough", adminLabel: 'Somewhat satisfied' },
        { val: 'neutral', label: 'Neutral — no strong feelings either way', adminLabel: 'Neutral' },
        { val: 'somewhat_dissatisfied', label: 'Somewhat dissatisfied — quality is inconsistent', adminLabel: 'Somewhat dissatisfied' },
        { val: 'very_dissatisfied', label: 'Very dissatisfied — I put off getting work done because of it', adminLabel: 'Very dissatisfied' }
      ]
    },
    {
      key: 'service_frequency',
      tag: 'Question 3 of 22',
      q: 'How often do you take your vehicle in for any type of service or maintenance?',
      opts: [
        { val: 'monthly_or_more', label: 'Monthly or more often', adminLabel: 'Monthly or more' },
        { val: 'every_2_3_months', label: 'Every 2-3 months', adminLabel: 'Every 2-3 months' },
        { val: 'twice_a_year', label: 'About twice a year', adminLabel: 'Twice a year' },
        { val: 'once_a_year', label: 'About once a year', adminLabel: 'Once a year' },
        { val: 'less_often', label: 'Less often than that', adminLabel: 'Less often' }
      ]
    },
    {
      key: 'service_types',
      tag: 'Question 4 of 22',
      q: 'What types of auto service do you get done most often?',
      opts: [
        { val: 'routine', label: 'Routine maintenance — oil changes, filters, fluids', adminLabel: 'Routine maintenance' },
        { val: 'tires_brakes', label: 'Tires and brakes', adminLabel: 'Tires & brakes' },
        { val: 'repairs', label: 'Repairs and diagnostics', adminLabel: 'Repairs/diagnostics' },
        { val: 'detailing', label: 'Detailing and cosmetic care', adminLabel: 'Detailing/cosmetic' },
        { val: 'body_work', label: 'Body work / collision repair', adminLabel: 'Body work' },
        { val: 'mix', label: 'A mix — different providers for different needs', adminLabel: 'Mixed/varies' }
      ]
    },
    {
      key: 'pricing_confidence',
      tag: 'Question 5 of 22',
      q: 'How would you rate the value and fairness of what you typically pay for auto work — repairs, car washes, or detailing?',
      opts: [
        { val: 'very_fair', label: 'Very fair — I consistently feel good about what I pay', adminLabel: 'Very fair' },
        { val: 'mostly_fair', label: 'Mostly fair — it varies but usually feels reasonable', adminLabel: 'Mostly fair' },
        { val: 'sometimes_questionable', label: 'Sometimes questionable — I wonder if I could have paid less', adminLabel: 'Sometimes questionable' },
        { val: 'often_too_high', label: 'Often too high — I feel overcharged more often than not', adminLabel: 'Often too high' }
      ]
    },
    {
      key: 'estimate_surprise',
      tag: 'Question 6 of 22',
      q: 'Have you ever received a final bill significantly higher than what you were originally quoted?',
      opts: [
        { val: 'yes_regularly', label: 'Yes, regularly', adminLabel: 'Yes, regularly' },
        { val: 'yes_once', label: 'Yes, at least once', adminLabel: 'Yes, once' },
        { val: 'no_never', label: 'No — quotes always match the final bill', adminLabel: 'No, never' }
      ]
    },
    {
      key: 'quote_behavior',
      tag: 'Question 7 of 22',
      q: 'When facing a larger repair job, how do you typically handle getting a price?',
      opts: [
        { val: 'go_with_first', label: 'I go with the first quote I get', adminLabel: 'Go with first quote' },
        { val: 'compare_few', label: 'I compare a few shops before deciding', adminLabel: 'Compare a few' },
        { val: 'always_shop', label: 'I always shop around extensively', adminLabel: 'Always shop around' }
      ]
    },
    {
      key: 'provider_honesty',
      tag: 'Question 8 of 22',
      q: 'How honest and straightforward do you find auto service providers when explaining what work needs to be done and why?',
      opts: [
        { val: 'very_honest', label: 'Very honest — I trust what they tell me', adminLabel: 'Very honest' },
        { val: 'mostly_honest', label: 'Mostly honest — but I sometimes question their recommendations', adminLabel: 'Mostly honest' },
        { val: 'sometimes_questionable', label: 'Sometimes questionable — I often feel upsold', adminLabel: 'Sometimes questionable' },
        { val: 'often_dishonest', label: "Often dishonest — I rarely trust what I'm told without a second opinion", adminLabel: 'Often dishonest' }
      ]
    },
    {
      key: 'provider_vetting',
      tag: 'Question 9 of 22',
      q: 'Do you research or vet a service provider before using them — checking reviews, credentials, etc.?',
      opts: [
        { val: 'always', label: 'Always — I do my homework first', adminLabel: 'Always vet' },
        { val: 'sometimes', label: 'Sometimes — depends on the job', adminLabel: 'Sometimes' },
        { val: 'rarely', label: 'Rarely — I usually just go with someone', adminLabel: 'Rarely' },
        { val: 'never', label: "Never — I don't think about it", adminLabel: 'Never' }
      ]
    },
    {
      key: 'history_tracking',
      tag: 'Question 10 of 22',
      q: "How do you keep track of your vehicle's service history?",
      opts: [
        { val: 'spreadsheet', label: 'A spreadsheet I maintain myself', adminLabel: 'Spreadsheet' },
        { val: 'notes_app', label: 'A notes app on my phone', adminLabel: 'Notes app' },
        { val: 'memory', label: 'From memory or old receipts', adminLabel: 'From memory' },
        { val: 'no_system', label: 'No system at all', adminLabel: 'No system' }
      ]
    },
    {
      key: 'maintenance_avoidance',
      tag: 'Question 11 of 22',
      q: 'Have you ever delayed or skipped necessary maintenance because dealing with a shop felt like too much trouble?',
      opts: [
        { val: 'yes_often', label: 'Yes, often', adminLabel: 'Yes, often' },
        { val: 'yes_sometimes', label: 'Yes, sometimes', adminLabel: 'Yes, sometimes' },
        { val: 'rarely', label: 'Rarely', adminLabel: 'Rarely' },
        { val: 'never', label: 'Never — I stay on top of it', adminLabel: 'Never' }
      ]
    },
    {
      key: 'job_status_updates',
      tag: 'Question 12 of 22',
      q: "When you drop your car off for service, how do you typically find out what's happening while it's being worked on?",
      opts: [
        { val: 'they_call', label: "They call me when it's ready", adminLabel: 'Shop calls me' },
        { val: 'i_call', label: 'I call the shop to check in', adminLabel: 'I call the shop' },
        { val: 'no_updates', label: 'No updates at all — I just show up', adminLabel: 'No updates' }
      ]
    },
    {
      key: 'maintenance_reminders',
      tag: 'Question 13 of 22',
      q: 'Do you currently use reminders for routine vehicle maintenance — oil changes, tire rotations, inspections, etc.?',
      opts: [
        { val: 'yes_use_them', label: 'Yes — I use reminders (from a shop, calendar, or app)', adminLabel: 'Yes, use them' },
        { val: 'no_try_to_remember', label: 'No — I just try to remember', adminLabel: 'Try to remember' },
        { val: 'no_just_go', label: 'No — I just go in when something feels off', adminLabel: 'Just go when needed' }
      ]
    },
    {
      key: 'competitive_bids',
      tag: 'Question 14 of 22',
      q: 'How would you feel about getting competitive bids for both your mechanical and cosmetic auto jobs?',
      opts: [
        { val: 'yes_always', label: "Yes — I'd always want competitive bids", adminLabel: 'Yes, always' },
        { val: 'open_to_it', label: 'Open to it — sounds worth trying', adminLabel: 'Open to it' },
        { val: 'prefer_one_provider', label: "I'd rather stick with one provider I trust", adminLabel: 'Prefer one provider' },
        { val: 'never_tried', label: "I've never tried — not sure how it would work", adminLabel: 'Never tried' }
      ]
    },
    {
      key: 'app_usage',
      tag: 'Question 15 of 22',
      q: 'Do you currently use any app or digital tool specifically for managing your vehicles?',
      opts: [
        { val: 'yes_multiple', label: 'Yes — I use multiple apps', adminLabel: 'Multiple apps' },
        { val: 'yes_one', label: 'Yes — I use one regularly', adminLabel: 'One app' },
        { val: 'no_old_fashioned', label: 'No — I handle it the old-fashioned way', adminLabel: 'No app' }
      ]
    },
    {
      key: 'payment_comfort',
      tag: 'Question 16 of 22',
      q: 'How comfortable are you paying for auto service through a secure app that holds your payment until the job is confirmed complete?',
      opts: [
        { val: 'already_do', label: 'I already do this', adminLabel: 'Already do' },
        { val: 'open_to_it', label: 'Open to it if the platform is trustworthy', adminLabel: 'Open to it' },
        { val: 'prefer_traditional', label: 'I prefer traditional payment in person', adminLabel: 'Prefer traditional' }
      ]
    },
    {
      key: 'dispute_history',
      tag: 'Question 17 of 22',
      q: "Have you ever had a dispute with a service provider over billing, work quality, or a job that wasn't finished correctly?",
      opts: [
        { val: 'never', label: 'Never — no real issues', adminLabel: 'Never' },
        { val: 'once', label: 'Yes — once', adminLabel: 'Once' },
        { val: 'multiple_times', label: 'Yes — multiple times', adminLabel: 'Multiple times' }
      ]
    },
    {
      key: 'annual_spend',
      tag: 'Question 18 of 22',
      q: 'Roughly how much does your household spend on auto service per year — repairs, maintenance, detailing, car washes combined?',
      opts: [
        { val: 'under_500', label: 'Under $500', adminLabel: 'Under $500' },
        { val: '500_to_1500', label: '$500 – $1,500', adminLabel: '$500-$1,500' },
        { val: '1500_to_3000', label: '$1,500 – $3,000', adminLabel: '$1,500-$3,000' },
        { val: 'over_3000', label: 'Over $3,000', adminLabel: 'Over $3,000' }
      ]
    },
    {
      key: 'decision_maker',
      tag: 'Question 19 of 22',
      q: 'Are you the primary person who arranges auto service for your household?',
      opts: [
        { val: 'yes_primary', label: 'Yes — I handle it entirely', adminLabel: 'Yes, primary' },
        { val: 'shared', label: 'Shared responsibility with someone else in the household', adminLabel: 'Shared' },
        { val: 'no_someone_else', label: 'Not usually — someone else handles it', adminLabel: 'Someone else' }
      ]
    },
    {
      key: 'near_term_need',
      tag: 'Question 20 of 22',
      q: "Do you have an auto service need you're looking to get done in the next 30 days?",
      opts: [
        { val: 'yes_routine', label: "Yes — routine maintenance that's coming due", adminLabel: 'Yes, routine' },
        { val: 'yes_repair', label: 'Yes — a repair that needs attention', adminLabel: 'Yes, repair' },
        { val: 'yes_shopping', label: "Yes — I'm shopping for a new vehicle", adminLabel: 'Yes, shopping' },
        { val: 'no_not_now', label: 'No — everything is good right now', adminLabel: 'Not right now' }
      ]
    },
    {
      key: 'top_priority',
      tag: 'Question 21 of 22',
      q: 'What matters most to you when choosing an auto service provider?',
      opts: [
        { val: 'trust', label: 'Trustworthiness and reputation', adminLabel: 'Trustworthiness' },
        { val: 'pricing', label: 'Fair, transparent pricing', adminLabel: 'Fair pricing' },
        { val: 'convenience', label: 'Convenience and easy scheduling', adminLabel: 'Convenience' },
        { val: 'quality', label: 'Quality of the work', adminLabel: 'Work quality' },
        { val: 'proximity', label: 'Location — I want someone nearby', adminLabel: 'Location/proximity' }
      ]
    },
    {
      key: 'vehicle_count',
      tag: 'Question 22 of 22',
      q: 'How many vehicles does your household currently have?',
      opts: [
        { val: '1', label: '1', adminLabel: '1 vehicle' },
        { val: '2', label: '2', adminLabel: '2 vehicles' },
        { val: '3_or_more', label: '3 or more', adminLabel: '3+ vehicles' }
      ]
    }
  ];

  // Canonical key list, in question order. Both server validation and admin
  // analytics iterate in this order so adding a new question only requires
  // appending it to QUESTIONS above.
  const KEYS = QUESTIONS.map(function (q) { return q.key; });

  // Server validation map: key -> [allowed enum values, plus '' for optional/unanswered].
  // Replaces the old hand-maintained ALLOWED map in server.js.
  const ALLOWED = {};
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    ALLOWED[q.key] = q.opts.map(function (o) { return o.val; }).concat(['']);
  }

  // Admin display labels: key -> { val: humanLabel }.
  // Replaces the old hand-maintained MS_LABELS map in admin.js.
  const LABELS = {};
  for (let i = 0; i < QUESTIONS.length; i++) {
    const q = QUESTIONS[i];
    const map = {};
    for (let j = 0; j < q.opts.length; j++) {
      const o = q.opts[j];
      map[o.val] = o.adminLabel || o.label;
    }
    LABELS[q.key] = map;
  }

  return { QUESTIONS: QUESTIONS, KEYS: KEYS, ALLOWED: ALLOWED, LABELS: LABELS };
});
