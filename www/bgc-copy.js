/* Task #114 — MCC Verified copy module. ALL strings here are taken verbatim
 * from MCC-BGC-Platform-Copy-and-Advertising_1776863828142.pdf. Do not
 * paraphrase. Pricing placeholders ($[XX]) and stat placeholders (78%) are
 * intentionally left literal until the user replaces them.
 *
 * Spanish translations are intentionally absent — the user handles ES manually.
 * <!-- TODO ES: every string in this file needs a Spanish counterpart. -->
 */
(function (global) {
  const COPY = {
    branding: {
      featureName:    'MCC Verified',
      tagline:        'Vetted Providers. Verified Trust.',
      badgeLabel:     '\u2713 Background Verified',
      compactLabel:   '\u2713 Verified',
      programName:    'MCC Verified Provider Program'
    },

    customer: {
      // Search results / listing card
      tooltipBadge:
        'This provider maintains current background checks on at least 90% of their customer-facing employees, verified through a nationally accredited screening service. Checks are renewed annually.',
      cardSubtitle:
        '\u2713 Background Verified \u2014 employees screened and current',
      filterLabel: 'Show only Verified Providers',
      filterDescription:
        'Verified Providers maintain current background checks on their employees, renewed every year.',

      // Provider detail page
      detailHeader: 'About MCC Verified',
      detailBody: function (providerName) {
        return (providerName || 'This provider') +
          ' is an MCC Verified provider. This means at least 90% of their customer-facing team has passed a comprehensive background check through our nationally accredited screening partner. These checks are renewed annually to ensure ongoing compliance.';
      },
      detailIncluded:
        "What's included in the screening: \u2022 Criminal history search (national + county level) \u2022 Sex offender registry check \u2022 Identity verification",
      detailFooter:
        'MCC takes your safety seriously. The Verified badge gives you confidence that the people working on your vehicle have been professionally screened.',

      // "Why does this matter?" expandable
      whyHeader: 'Why does this matter?',
      whyBody:
        "You\u2019re trusting someone with your vehicle \u2014 often at your home or workplace. MCC Verified providers have gone the extra mile to prove they\u2019re trustworthy. Background checks aren\u2019t required to join MCC, but providers who complete them earn the Verified badge, giving you an easy way to choose with confidence.",

      // Car Club profile area (compliant)
      ccHeader: 'MCC Verified Provider',
      ccBody: function (compliant, total, lastVerified) {
        return 'Background checks current for ' + (compliant || 0) + ' of ' + (total || 0) +
          ' team members\nLast verified: ' + (lastVerified || '—');
      },
      // Car Club profile area (NOT verified — neutral, no alarm)
      ccNotVerified:
        'This provider has not yet completed the MCC Verified program. You can still request bids from them \u2014 many great providers are in the process of getting verified.'
    },

    provider: {
      // Dashboard compliance card — 4 states
      cardActive: function (pct) {
        return {
          title: 'MCC Verified \u2014 Active \u2713',
          body:  'Your team is ' + pct + '% compliant. Your Verified badge is live and visible to customers.',
          cta:   'View compliance details \u2192'
        };
      },
      cardAtRisk: function (pct, count) {
        return {
          title: 'MCC Verified \u2014 At Risk',
          body:  'Your compliance is at ' + pct + '%. You need 90% to keep your Verified badge. ' + count + ' employee(s) need attention.',
          cta:   'View details \u2192'
        };
      },
      cardInactive: function (pct) {
        return {
          title: 'MCC Verified \u2014 Inactive \u2717',
          body:  'Your compliance has dropped to ' + pct + '%. Your Verified badge has been removed from your listing. Renew expired checks to restore it.',
          cta:   'Renew now \u2192'
        };
      },
      cardNotEnrolled: {
        title: 'Get MCC Verified',
        body:  'Stand out from the competition. Background-checked providers get up to 3x more bid responses from customers.',
        cta:   'Start the verification process \u2192'
      },

      // Provider marketing block
      marketingHeadline: 'Earn the badge customers trust',
      marketingSubhead:
        'MCC Verified providers get more visibility, more bids, and more repeat customers. Background checks are fast, affordable, and handled right inside your dashboard.',
      valueProps: [
        { title: 'Stand out in search',
          body:  'Verified providers are highlighted in search results and recommended first to customers in your area.' },
        { title: 'Build instant trust',
          body:  '78% of vehicle owners say they\u2019re more likely to choose a provider with verified background checks.*' },
        { title: 'Simple compliance',
          body:  'Add your team, initiate checks with one click, and we handle the rest \u2014 including renewal reminders so you never lose your badge.' },
        { title: 'Affordable',
          body:  'Background checks start at $[XX] per employee, per year. A small investment that pays for itself with your first extra booking.' }
      ],
      marketingFootnote: '*Placeholder stat \u2014 replace with actual survey/data when available'
    },

    onboarding: {
      step1: {
        title: 'Get MCC Verified',
        body: 'The MCC Verified badge appears on your listing and Car Club profile when at least 90% of your customer-facing employees have a current background check on file. Checks are valid for 12 months.',
        screened: "What\u2019s screened:\nNational criminal records \u00b7 County-level records \u00b7 Sex offender registry \u00b7 Identity verification",
        cost: "What it costs:\n$[XX] per employee \u00b7 Results in 1\u20133 business days",
        need: "What you need:\nEach employee\u2019s full name, date of birth, email, and current address. You\u2019ll also need their consent (we provide the form).",
        cta: 'Continue \u2192'
      },
      step2: {
        title: 'Add your team',
        body: 'Add each customer-facing employee who will be working directly with MCC customers. Back-office staff who don\u2019t interact with customers can be excluded.',
        helper: 'Don\u2019t have everyone\u2019s info right now? You can add employees later from your provider dashboard.'
      },
      step3: {
        title: 'Employee consent',
        body: 'Background checks require each employee\u2019s written consent under the Fair Credit Reporting Act (FCRA). We\u2019ll send each employee a secure consent form via email.',
        confirm: 'By proceeding, you confirm that you have authorization to submit background checks on behalf of the listed employees.',
        cta: 'Send Consent Forms \u2192'
      },
      step4: {
        title: 'You\u2019re on your way to Verified',
        body: function (n) {
          return 'Background checks have been initiated for ' + (n || 0) + ' employees. Most results come back within 1\u20133 business days.';
        },
        next: [
          'Each employee will receive a consent form via email',
          'Once consent is confirmed and the check completes, results update automatically',
          'When 90% of your team is cleared, your Verified badge goes live',
          'You\u2019ll get an email when your badge is active'
        ],
        cta: 'Go to Dashboard \u2192'
      }
    },

    badge: {
      // Listing-page detail line
      fullDetail: function (compliant, total) {
        return (compliant || 0) + ' of ' + (total || 0) + ' employees screened \u00b7 Renewed annually';
      },
      tooltip:
        'This provider\u2019s team is background-checked through MCC\u2019s accredited screening partner. Checks include criminal history, sex offender registry, and identity verification. Renewed annually.',
      modal: {
        header: 'What does MCC Verified mean?',
        body:   'Providers with the MCC Verified badge maintain current background checks on at least 90% of their customer-facing employees. Checks are conducted by a nationally accredited screening service and must be renewed every 12 months.',
        included: 'What\u2019s included in the screening? \u2022 National criminal history search \u2022 County-level criminal records \u2022 National sex offender registry \u2022 Identity verification',
        guarantee: 'Is this a guarantee? The MCC Verified badge indicates that a provider has completed the screening process and is maintaining compliance. It is not a guarantee of future behavior. We encourage you to use your own judgment alongside this information.',
        learnMore: 'Learn more about MCC\u2019s safety commitment \u2192'
      }
    },

    homepage: {
      customerHeader: 'Your car. Your trust. Our verification.',
      customerBody:
        'Every MCC Verified provider has passed comprehensive background screening for their team. Look for the \u2713 badge when browsing providers \u2014 it means their employees are screened, verified, and current.',
      customerCta: 'Browse Verified Providers \u2192',

      howItWorksHeader: 'Choose with confidence',
      howItWorksBody:
        'Compare bids from verified providers. The \u2713 badge means their team has been background-checked through our accredited screening partner, with checks renewed every year.',

      providerHeader: 'Verified providers book more jobs',
      providerBody:
        'The MCC Verified badge tells customers your team is background-checked and trustworthy. It\u2019s the fastest way to build credibility on the platform \u2014 and verified providers see higher bid acceptance rates and more repeat customers.',
      providerColumns: [
        { title: 'Comprehensive Screening',
          body:  'National criminal records, sex offender registry, and identity verification \u2014 handled by our accredited partner.' },
        { title: 'Always Current',
          body:  'Annual renewals keep your badge up to date. We send reminders at 60, 30, 14, and 7 days before expiration \u2014 you\u2019ll never be caught off guard.' },
        { title: 'Simple Compliance',
          body:  'Your provider dashboard shows exactly where you stand: who\u2019s verified, who\u2019s expiring, and what to do next.' }
      ],
      providerCtaNew:      'Start Your Verification \u2192',
      providerCtaExisting: 'Manage Your Team \u2192',

      trustBar:
        'Background-checked providers \u00b7 Annual renewal required \u00b7 \u2713 90% team compliance minimum \u00b7 Nationally accredited screening'
    },

    legal: {
      consumer:
        'Background check information is provided by a third-party consumer reporting agency. My Car Concierge does not conduct background checks directly. The MCC Verified badge indicates that a provider has met the program\u2019s compliance requirements at the time of verification. It is not a guarantee, warranty, or endorsement of any provider\u2019s character, qualifications, or future conduct. My Car Concierge is not liable for the acts or omissions of any service provider. Consumers should exercise their own judgment when selecting service providers.'
    }
  };

  global.MCC_BGC_COPY = COPY;
})(typeof window !== 'undefined' ? window : globalThis);
