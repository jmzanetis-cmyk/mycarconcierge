/**
 * My Car Concierge - Email Templates & Notification System
 * 
 * This configuration file defines email templates and notification preferences.
 * In production, use a service like SendGrid, Mailgun, or AWS SES.
 */

// ========== EMAIL TEMPLATES ==========

const EmailTemplates = {
  
  // ===== MEMBER EMAILS =====
  
  welcome_member: {
    subject: 'Welcome to My Car Concierge!',
    template: `
      <h1>Welcome to My Car Concierge, {{name}}!</h1>
      <p>You've joined the smarter way to maintain your vehicles.</p>
      
      <h2>Get Started:</h2>
      <ol>
        <li><strong>Add your vehicle</strong> to your Digital Garage</li>
        <li><strong>Create a maintenance package</strong> describing what you need</li>
        <li><strong>Receive anonymous bids</strong> from vetted providers</li>
        <li><strong>Accept the best bid</strong> and schedule your service</li>
      </ol>
      
      <p>Your payment is held in escrow until you confirm the work is complete.</p>
      
      <a href="{{dashboard_url}}" class="button">Go to Dashboard</a>
      
      <p>Questions? Reply to this email or visit our help center.</p>
    `
  },

  bid_received: {
    subject: 'New Bid on Your Maintenance Package: {{package_title}}',
    template: `
      <h1>You've received a new bid!</h1>
      
      <div class="card">
        <h2>{{package_title}}</h2>
        <p>{{vehicle_name}}</p>
        <hr>
        <p><strong>Bid Amount:</strong> \${{bid_amount}}</p>
        <p><strong>Estimated Timeline:</strong> {{timeline}}</p>
        <p><strong>Provider Rating:</strong> {{provider_rating}} ⭐</p>
      </div>
      
      <p>You now have <strong>{{total_bids}} bids</strong> on this package.</p>
      
      <a href="{{package_url}}" class="button">View All Bids</a>
      
      <p class="hint">Tip: Wait for multiple bids to get the best value!</p>
    `
  },

  bidding_ending_soon: {
    subject: '⏰ Bidding Ends Soon: {{package_title}}',
    template: `
      <h1>Your bidding window is closing soon!</h1>
      
      <div class="card">
        <h2>{{package_title}}</h2>
        <p>{{vehicle_name}}</p>
        <hr>
        <p><strong>Bidding Ends:</strong> {{deadline}}</p>
        <p><strong>Time Remaining:</strong> {{time_remaining}}</p>
        <p><strong>Current Bids:</strong> {{total_bids}}</p>
      </div>
      
      <p>Review your bids now and accept the best one before the window closes.</p>
      
      <a href="{{package_url}}" class="button">Review Bids</a>
      
      <p class="hint">After the deadline, you can still repost the package if you need more bids.</p>
    `
  },

  bidding_expired: {
    subject: 'Bidding Closed: {{package_title}}',
    template: `
      <h1>Your bidding window has closed</h1>
      
      <div class="card">
        <h2>{{package_title}}</h2>
        <p>{{vehicle_name}}</p>
        <hr>
        <p><strong>Total Bids Received:</strong> {{total_bids}}</p>
      </div>
      
      {{#if has_bids}}
      <p>You have <strong>{{total_bids}} bids</strong> to review. Accept a bid to proceed with service.</p>
      <a href="{{package_url}}" class="button">Review & Accept a Bid</a>
      {{else}}
      <p>Unfortunately, no providers submitted bids during the window.</p>
      <p>You can repost the package to try again with a new deadline.</p>
      <a href="{{package_url}}" class="button">Repost Package</a>
      {{/if}}
    `
  },

  new_message: {
    subject: 'New Message: {{package_title}}',
    template: `
      <h1>You have a new message</h1>
      
      <div class="card">
        <p><strong>From:</strong> {{sender_name}}</p>
        <p><strong>Regarding:</strong> {{package_title}}</p>
        <hr>
        <p>"{{message_preview}}"</p>
      </div>
      
      <a href="{{message_url}}" class="button">View & Reply</a>
    `
  },

  bid_accepted_member: {
    subject: 'Bid Accepted - {{package_title}}',
    template: `
      <h1>Your bid has been accepted!</h1>
      
      <div class="card">
        <h2>{{package_title}}</h2>
        <p>{{vehicle_name}}</p>
        <hr>
        <p><strong>Accepted Bid:</strong> \${{bid_amount}}</p>
        <p><strong>Provider:</strong> {{provider_name}}</p>
        <p><strong>Payment Status:</strong> ✓ Held in Escrow</p>
      </div>
      
      <h2>What's Next?</h2>
      <ol>
        <li>The provider will contact you to schedule</li>
        <li>Work will begin as agreed</li>
        <li>Confirm completion when satisfied</li>
        <li>Payment released to provider</li>
      </ol>
      
      <a href="{{package_url}}" class="button">View Details</a>
      
      <p class="hint">Your payment is protected until you confirm the work is complete.</p>
    `
  },

  work_started: {
    subject: 'Work Has Started on {{package_title}}',
    template: `
      <h1>Your service has begun! 🔧</h1>
      
      <div class="card">
        <h2>{{package_title}}</h2>
        <p>{{vehicle_name}}</p>
        <hr>
        <p><strong>Provider:</strong> {{provider_name}}</p>
        <p><strong>Started:</strong> {{start_time}}</p>
      </div>
      
      <p>The provider is now working on your vehicle. You'll be notified when they mark the job as complete.</p>
      
      <a href="{{package_url}}" class="button">Track Progress</a>
      
      <p class="hint">Have questions? Message the provider through your dashboard.</p>
    `
  },

  work_completed: {
    subject: 'Action Required: Confirm Completion of {{package_title}}',
    template: `
      <h1>Your service is complete! ✅</h1>
      
      <div class="card">
        <h2>{{package_title}}</h2>
        <p>{{vehicle_name}}</p>
        <hr>
        <p><strong>Provider:</strong> {{provider_name}}</p>
        <p><strong>Completed:</strong> {{completion_time}}</p>
        <p><strong>Amount:</strong> \${{amount}}</p>
      </div>
      
      <h2>Please Confirm Completion</h2>
      <p>Once you've received your vehicle and are satisfied with the work, please confirm completion to release payment.</p>
      
      <a href="{{confirm_url}}" class="button">Confirm & Release Payment</a>
      
      <p class="warning">If you don't respond within 7 days, payment will be automatically released.</p>
      
      <p class="hint">Not satisfied? You can open a dispute from your dashboard.</p>
    `
  },

  upsell_request: {
    subject: 'Action Required: Additional Work Found - {{package_title}}',
    template: `
      <h1>Your provider found an additional issue</h1>
      
      <div class="card alert">
        <h2>{{issue_title}}</h2>
        <p>{{issue_description}}</p>
        <hr>
        <p><strong>Urgency:</strong> {{urgency}}</p>
        <p><strong>Estimated Cost:</strong> \${{estimated_cost}}</p>
        <p><strong>Response Deadline:</strong> {{deadline}}</p>
      </div>
      
      <h2>Your Options:</h2>
      <ul>
        <li><strong>Approve:</strong> Add this work to your service</li>
        <li><strong>Decline:</strong> Continue with original scope only</li>
        <li><strong>Get Competing Bids:</strong> Create a new package for this issue</li>
      </ul>
      
      <a href="{{respond_url}}" class="button">Review & Respond</a>
      
      <p class="hint">You have 24 hours to respond. The original work will proceed regardless.</p>
    `
  },

  payment_released: {
    subject: 'Payment Confirmed - {{package_title}}',
    template: `
      <h1>Payment has been released</h1>
      
      <div class="card">
        <h2>{{package_title}}</h2>
        <p>{{vehicle_name}}</p>
        <hr>
        <p><strong>Amount Paid:</strong> \${{amount}}</p>
        <p><strong>Provider:</strong> {{provider_name}}</p>
        <p><strong>Date:</strong> {{date}}</p>
      </div>
      
      <h2>How was your experience?</h2>
      <p>Your feedback helps other members choose the best providers.</p>
      
      <a href="{{review_url}}" class="button">Leave a Review</a>
      
      <p>Thank you for using My Car Concierge!</p>
    `
  },

  // ===== PROVIDER EMAILS =====

  welcome_provider: {
    subject: 'Welcome to My Car Concierge - Application Received',
    template: `
      <h1>Thank you for applying, {{business_name}}!</h1>
      
      <p>We've received your provider application and our team will review it shortly.</p>
      
      <h2>What Happens Next:</h2>
      <ol>
        <li>Our team reviews your credentials (1-3 business days)</li>
        <li>We verify your insurance and certifications</li>
        <li>You'll receive an approval email</li>
        <li>Set up your Stripe account for payments</li>
        <li>Start receiving bid opportunities!</li>
      </ol>
      
      <p>Need to update your application? Reply to this email.</p>
    `
  },

  provider_approved: {
    subject: '🎉 Congratulations! You\'re Now an MCC Provider',
    template: `
      <h1>You're approved, {{business_name}}!</h1>
      
      <p>Congratulations! Your My Car Concierge provider account is now active.</p>
      
      <h2>Get Started:</h2>
      <ol>
        <li><strong>Set up payments:</strong> Connect your Stripe account</li>
        <li><strong>Complete your profile:</strong> Add photos and specializations</li>
        <li><strong>Browse opportunities:</strong> View open maintenance packages</li>
        <li><strong>Submit bids:</strong> Win jobs with competitive pricing</li>
      </ol>
      
      <a href="{{dashboard_url}}" class="button">Go to Provider Dashboard</a>
      
      <h2>How It Works:</h2>
      <ul>
        <li>Members post anonymous maintenance packages</li>
        <li>You submit competitive bids</li>
        <li>Payment is held in escrow when bid accepted</li>
        <li>Complete the work, get paid (minus 7.5% MCC fee)</li>
      </ul>
      
      <p>Questions? Visit our provider help center.</p>
    `
  },

  bid_accepted_provider: {
    subject: '🎉 Your Bid Was Accepted! - {{package_title}}',
    template: `
      <h1>Congratulations! You won the job!</h1>
      
      <div class="card">
        <h2>{{package_title}}</h2>
        <p>{{vehicle_info}}</p>
        <hr>
        <p><strong>Your Bid:</strong> \${{bid_amount}}</p>
        <p><strong>You'll Receive:</strong> \${{provider_amount}} (after 7.5% fee)</p>
        <p><strong>Payment Status:</strong> ✓ Held in Escrow</p>
      </div>
      
      <h2>Next Steps:</h2>
      <ol>
        <li>Contact the member to schedule</li>
        <li>Mark "Work Started" when you begin</li>
        <li>Complete the agreed scope</li>
        <li>Mark "Complete" when finished</li>
        <li>Payment released after member confirms</li>
      </ol>
      
      <a href="{{job_url}}" class="button">View Job Details</a>
      
      <p class="warning">Important: Only charge for the agreed scope. Additional work requires member approval.</p>
    `
  },

  payment_received: {
    subject: 'Payment Received - \${{amount}} - {{package_title}}',
    template: `
      <h1>You've been paid! 💰</h1>
      
      <div class="card">
        <h2>{{package_title}}</h2>
        <hr>
        <p><strong>Job Total:</strong> \${{total_amount}}</p>
        <p><strong>MCC Fee (7.5%):</strong> -\${{mcc_fee}}</p>
        <p><strong>Your Payment:</strong> \${{provider_amount}}</p>
      </div>
      
      <p>The payment will be deposited to your connected bank account within 2-3 business days.</p>
      
      <a href="{{earnings_url}}" class="button">View Earnings</a>
      
      <p>Thank you for providing great service!</p>
    `
  },

  // ===== ADMIN/SYSTEM EMAILS =====

  dispute_opened: {
    subject: '[Action Required] Dispute Opened - {{package_title}}',
    template: `
      <h1>A dispute has been filed</h1>
      
      <div class="card alert">
        <h2>{{package_title}}</h2>
        <hr>
        <p><strong>Filed By:</strong> {{filed_by}}</p>
        <p><strong>Reason:</strong> {{reason}}</p>
        <p><strong>Amount:</strong> \${{amount}}</p>
        <p><strong>Inspection Required:</strong> {{requires_inspection}}</p>
      </div>
      
      <p><strong>Description:</strong></p>
      <p>{{description}}</p>
      
      <a href="{{dispute_url}}" class="button">Review Dispute</a>
    `
  },

  document_expiring: {
    subject: 'Action Required: Document Expiring Soon - {{document_type}}',
    template: `
      <h1>Your {{document_type}} is expiring soon</h1>
      
      <div class="card warning">
        <p><strong>Document:</strong> {{document_type}}</p>
        <p><strong>Expires:</strong> {{expiration_date}}</p>
        <p><strong>Days Remaining:</strong> {{days_remaining}}</p>
      </div>
      
      <p>Please upload a new {{document_type}} before it expires to avoid account suspension.</p>
      
      <a href="{{upload_url}}" class="button">Upload New Document</a>
      
      <p class="warning">Your account will be automatically suspended if documents expire.</p>
    `
  },

  // ===== FOUNDER COMMISSION EMAILS =====

  founder_commission_earned: {
    subject: 'You Earned a Commission - \${{commission_amount}}',
    template: `
      <h1>Congratulations, {{founder_name}}!</h1>
      
      <p>You've earned a new commission from your referral activity.</p>
      
      <div class="card" style="background: linear-gradient(135deg, #d4a855 0%, #c49a45 100%); color: #0a0a0f;">
        <h2 style="color: #0a0a0f; margin-bottom: 16px;">Commission Details</h2>
        <p><strong>Type:</strong> {{commission_type}}</p>
        <p><strong>Original Amount:</strong> \${{original_amount}}</p>
        <p><strong>Your Commission:</strong> <span style="font-size: 1.5em; font-weight: bold;">\${{commission_amount}}</span></p>
        <p><strong>Commission Rate:</strong> {{commission_rate}}%</p>
      </div>
      
      <div class="card">
        <h3>Your Founder Stats</h3>
        <p><strong>Total Earnings:</strong> \${{total_earnings}}</p>
        <p><strong>Pending Balance:</strong> \${{pending_balance}}</p>
        <p><strong>Total Referrals:</strong> {{total_referrals}}</p>
      </div>
      
      <p>Keep sharing your referral code to earn more!</p>
      
      <a href="{{dashboard_url}}" class="button">View Founder Dashboard</a>
      
      <p class="hint">Payouts are processed on the 15th of each month for balances of $25 or more.</p>
    `
  },

  founder_referral_signup: {
    subject: 'New Referral Signup - {{referral_type}}',
    template: `
      <h1>Great news, {{founder_name}}!</h1>
      
      <p>Someone just signed up using your referral code!</p>
      
      <div class="card">
        <h2>New {{referral_type}} Referral</h2>
        <hr>
        <p><strong>Referral Code Used:</strong> {{referral_code}}</p>
        <p><strong>Type:</strong> {{referral_type}}</p>
        <p><strong>Date:</strong> {{signup_date}}</p>
      </div>
      
      <h3>What This Means For You:</h3>
      <ul>
        <li>You'll earn <strong>50% commission</strong> on every bid pack this provider purchases</li>
        <li>Commission is automatically credited to your account</li>
        <li>This is a lifetime commission - earn on all their future purchases!</li>
      </ul>
      
      <div class="card">
        <h3>Your Referral Stats</h3>
        <p><strong>Provider Referrals:</strong> {{provider_referrals}}</p>
        <p><strong>Member Referrals:</strong> {{member_referrals}}</p>
        <p><strong>Total Earnings:</strong> \${{total_earnings}}</p>
      </div>
      
      <a href="{{dashboard_url}}" class="button">View Founder Dashboard</a>
    `
  },

  founder_payout_processed: {
    subject: 'Payout Processed - \${{payout_amount}}',
    template: `
      <h1>Your payout has been processed!</h1>
      
      <p>Hi {{founder_name}},</p>
      
      <p>We've processed your founder commission payout.</p>
      
      <div class="card" style="background: linear-gradient(135deg, #4ac88c 0%, #38a376 100%); color: white;">
        <h2 style="color: white;">Payout Details</h2>
        <p><strong>Amount:</strong> <span style="font-size: 1.5em; font-weight: bold;">\${{payout_amount}}</span></p>
        <p><strong>Period:</strong> {{payout_period}}</p>
        <p><strong>Method:</strong> {{payout_method}}</p>
        <p><strong>Date:</strong> {{payout_date}}</p>
      </div>
      
      <p>The funds should arrive in your account within 2-5 business days depending on your payment method.</p>
      
      <a href="{{dashboard_url}}" class="button">View Payout History</a>
      
      <p>Thank you for being a valued Member Founder!</p>
    `
  },

  founder_tier_upgrade: {
    subject: 'Congratulations! You\'ve Reached {{new_tier}} Tier',
    template: `
      <h1>You've Been Upgraded!</h1>
      
      <p>Hi {{founder_name}},</p>
      
      <p>Your exceptional performance has earned you an upgrade to a higher commission tier!</p>
      
      <div class="card" style="background: linear-gradient(135deg, #d4a855 0%, #4a7cff 100%); color: white;">
        <h2 style="color: white;">New Tier: {{new_tier}}</h2>
        <p><strong>Previous Tier:</strong> {{previous_tier}}</p>
        <p><strong>New Commission Rates:</strong></p>
        <ul style="color: white;">
          <li>Bid Pack Commission: <strong>{{new_bid_pack_rate}}%</strong></li>
          <li>Platform Fee Commission: <strong>{{new_platform_fee_rate}}%</strong></li>
        </ul>
      </div>
      
      <h3>How You Got Here:</h3>
      <div class="card">
        <p><strong>Total Referrals:</strong> {{total_referrals}}</p>
        <p><strong>Total Earnings:</strong> \${{total_earnings}}</p>
        <p><strong>Months Active:</strong> {{months_active}}</p>
      </div>
      
      <p>Keep up the great work! The more referrals you bring, the more you earn.</p>
      
      <a href="{{dashboard_url}}" class="button">View Founder Dashboard</a>
    `
  },

  founder_approved: {
    subject: '🎉 Welcome to the My Car Concierge Founder Program!',
    template: `
      <h1>Congratulations, {{name}}!</h1>
      
      <p>Your application to become a Member Founder has been approved! Welcome to the My Car Concierge ambassador program.</p>
      
      <div class="card" style="background: linear-gradient(135deg, #d4a855 0%, #c49a45 100%); color: #0a0a0f;">
        <h2 style="color: #0a0a0f; margin-bottom: 16px;">Your Unique Referral Code</h2>
        <p style="font-size: 2em; font-weight: bold; text-align: center; letter-spacing: 4px; margin: 16px 0;">{{referral_code}}</p>
        <p style="text-align: center;">Share this code with providers and earn commissions!</p>
      </div>
      
      <h2>💰 How You Earn</h2>
      <div class="card">
        <p>You earn <strong>50% commission</strong> on all bid pack purchases from providers you refer.</p>
        <p>This is a <strong>lifetime commission</strong> — you'll continue earning on every bid pack they purchase, forever!</p>
      </div>
      
      <h2>📱 Your Personal QR Code</h2>
      <div class="card">
        <p>We've generated a unique QR code for you that makes sharing easy. Providers can simply scan it to sign up with your referral code already applied.</p>
        <p><strong>To find your QR code:</strong></p>
        <ol>
          <li>Visit your <a href="{{dashboard_url}}">Founder Dashboard</a></li>
          <li>Look for the "Your Referral QR Code" section</li>
          <li>Download or share your QR code directly</li>
        </ol>
      </div>
      
      <h2>🚀 Get Started</h2>
      <ol>
        <li><strong>Visit your dashboard</strong> to view your referral tools and stats</li>
        <li><strong>Set up your payout method</strong> to receive your commission payments</li>
        <li><strong>Start sharing</strong> your referral code with auto service providers</li>
        <li><strong>Track your earnings</strong> as providers sign up and purchase bid packs</li>
      </ol>
      
      <a href="{{dashboard_url}}" class="button">Go to Founder Dashboard</a>
      
      <h2>⚙️ Set Up Your Payout Method</h2>
      <div class="card">
        <p>To receive your commission payments, you'll need to connect a payout method:</p>
        <ol>
          <li>Go to your <a href="{{dashboard_url}}">Founder Dashboard</a></li>
          <li>Click on "Connect Payout Account" in the Earnings section</li>
          <li>Follow the prompts to connect your bank account via Stripe</li>
        </ol>
        <p><strong>Payouts are processed on the 15th of each month</strong> for balances of $25 or more.</p>
      </div>
      
      <p>We're excited to have you as a Member Founder. Your success is our success!</p>
      
      <p>Questions? Reply to this email or visit our help center.</p>
    `
  }
};

// ========== NOTIFICATION PREFERENCES ==========

const NotificationTypes = {
  // Member notifications
  bid_received: { email: true, push: true, inApp: true },
  bid_accepted: { email: true, push: true, inApp: true },
  work_started: { email: true, push: true, inApp: true },
  work_completed: { email: true, push: true, inApp: true },
  upsell_request: { email: true, push: true, inApp: true },
  payment_released: { email: true, push: false, inApp: true },
  message_received: { email: false, push: true, inApp: true },
  reminder: { email: true, push: true, inApp: true },
  
  // Provider notifications
  new_package_match: { email: true, push: true, inApp: true },
  bid_accepted_provider: { email: true, push: true, inApp: true },
  payment_received: { email: true, push: true, inApp: true },
  message_from_member: { email: false, push: true, inApp: true },
  upsell_response: { email: true, push: true, inApp: true },
  document_expiring: { email: true, push: true, inApp: true },
  
  // System notifications
  dispute_opened: { email: true, push: true, inApp: true },
  dispute_resolved: { email: true, push: true, inApp: true },
  account_suspended: { email: true, push: true, inApp: true },
  
  // Founder notifications
  founder_commission_earned: { email: true, push: true, inApp: true },
  founder_referral_signup: { email: true, push: true, inApp: true },
  founder_payout_processed: { email: true, push: false, inApp: true },
  founder_tier_upgrade: { email: true, push: true, inApp: true },
  founder_approved: { email: true, push: true, inApp: true }
};

// ========== HELPER FUNCTIONS ==========

/**
 * Render email template with data
 */
function renderEmail(templateName, data) {
  const template = EmailTemplates[templateName];
  if (!template) {
    throw new Error(`Email template not found: ${templateName}`);
  }
  
  let subject = template.subject;
  let html = template.template;
  
  // Replace placeholders
  Object.keys(data).forEach(key => {
    const regex = new RegExp(`{{${key}}}`, 'g');
    subject = subject.replace(regex, data[key]);
    html = html.replace(regex, data[key]);
  });
  
  // Wrap in base template
  html = wrapInBaseTemplate(html);
  
  return { subject, html };
}

/**
 * Base email template wrapper
 */
function wrapInBaseTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
    }
    h1 { color: #1a1a2e; margin-bottom: 20px; }
    h2 { color: #16213e; margin-top: 30px; }
    .card {
      background: #f8f9fa;
      border: 1px solid #e9ecef;
      border-radius: 12px;
      padding: 20px;
      margin: 20px 0;
    }
    .card.alert {
      background: #fff3cd;
      border-color: #ffc107;
    }
    .card.warning {
      background: #f8d7da;
      border-color: #f5c6cb;
    }
    .button {
      display: inline-block;
      background: #4a7cff;
      color: white !important;
      text-decoration: none;
      padding: 12px 24px;
      border-radius: 8px;
      font-weight: 600;
      margin: 20px 0;
    }
    .button:hover { background: #3d6ce0; }
    .hint {
      color: #6c757d;
      font-size: 14px;
      margin-top: 20px;
    }
    .warning {
      color: #856404;
      background: #fff3cd;
      padding: 12px;
      border-radius: 8px;
      margin: 20px 0;
    }
    hr {
      border: none;
      border-top: 1px solid #e9ecef;
      margin: 15px 0;
    }
    ul, ol { padding-left: 20px; }
    li { margin-bottom: 8px; }
  </style>
</head>
<body>
  <div style="text-align: center; margin-bottom: 30px;">
    <img src="https://mycarconcierge.com/logo.png" alt="My Car Concierge" style="height: 50px;">
  </div>
  
  ${content}
  
  <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e9ecef; text-align: center; color: #6c757d; font-size: 12px;">
    <p>My Car Concierge - Your Trusted Auto Care Platform</p>
    <p>
      <a href="{{unsubscribe_url}}" style="color: #6c757d;">Unsubscribe</a> |
      <a href="{{preferences_url}}" style="color: #6c757d;">Email Preferences</a> |
      <a href="{{help_url}}" style="color: #6c757d;">Help Center</a>
    </p>
  </div>
</body>
</html>
  `;
}

/**
 * Queue email for sending via Supabase
 * Emails are stored in email_queue table and processed by Edge Function
 */
async function queueEmail(recipientEmail, recipientName, templateName, templateData) {
  try {
    const { subject, html } = renderEmail(templateName, templateData);
    
    // Insert into email queue (requires supabaseClient to be available)
    if (typeof supabaseClient !== 'undefined') {
      const { error } = await supabaseClient.from('email_queue').insert({
        to_email: recipientEmail,
        to_name: recipientName || null,
        subject: subject,
        html_body: html,
        template_name: templateName,
        template_data: templateData,
        status: 'pending'
      });
      
      if (error) {
        console.error('[EMAIL] Queue error:', error);
        return { success: false, error: error.message };
      }
      
      console.log('[EMAIL] Queued:', { to: recipientEmail, subject });
      return { success: true, templateName, recipient: recipientEmail };
    } else {
      console.log('[EMAIL] No supabaseClient - would queue:', { to: recipientEmail, subject });
      return { success: true, templateName, recipient: recipientEmail };
    }
  } catch (err) {
    console.error('[EMAIL] Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send email notification for common events
 * Helper functions that combine template + queue
 */
async function sendBidReceivedEmail(memberEmail, memberName, packageTitle, vehicleName, bidAmount, totalBids) {
  return queueEmail(memberEmail, memberName, 'bid_received', {
    name: memberName,
    package_title: packageTitle,
    vehicle_name: vehicleName,
    bid_amount: bidAmount.toFixed(2),
    timeline: 'TBD',
    provider_rating: '4.5',
    total_bids: totalBids,
    package_url: 'https://mycarconcierge.com/members.html'
  });
}

async function sendBidAcceptedEmail(providerEmail, providerName, packageTitle, bidAmount) {
  return queueEmail(providerEmail, providerName, 'bid_accepted_provider', {
    name: providerName,
    package_title: packageTitle,
    bid_amount: bidAmount.toFixed(2),
    dashboard_url: 'https://mycarconcierge.com/providers.html'
  });
}

async function sendWorkCompletedEmail(memberEmail, memberName, packageTitle, vehicleName, amount, providerName) {
  return queueEmail(memberEmail, memberName, 'work_completed', {
    name: memberName,
    package_title: packageTitle,
    vehicle_name: vehicleName,
    provider_name: providerName,
    amount: amount.toFixed(2),
    completion_time: new Date().toLocaleString(),
    confirm_url: 'https://mycarconcierge.com/members.html'
  });
}

async function sendPaymentReceivedEmail(providerEmail, providerName, packageTitle, amount) {
  return queueEmail(providerEmail, providerName, 'payment_received', {
    name: providerName,
    package_title: packageTitle,
    amount: amount.toFixed(2),
    date: new Date().toLocaleDateString(),
    earnings_url: 'https://mycarconcierge.com/providers.html'
  });
}

// ===== FOUNDER EMAIL HELPER FUNCTIONS =====

async function sendFounderCommissionEarnedEmail(founderEmail, founderName, commissionData) {
  return queueEmail(founderEmail, founderName, 'founder_commission_earned', {
    founder_name: founderName,
    commission_type: commissionData.type === 'bid_pack' ? 'Bid Pack Purchase' : 'Platform Fee',
    original_amount: parseFloat(commissionData.original_amount).toFixed(2),
    commission_amount: parseFloat(commissionData.commission_amount).toFixed(2),
    commission_rate: (parseFloat(commissionData.commission_rate) * 100).toFixed(0),
    total_earnings: parseFloat(commissionData.total_earnings || 0).toFixed(2),
    pending_balance: parseFloat(commissionData.pending_balance || 0).toFixed(2),
    total_referrals: commissionData.total_referrals || 0,
    dashboard_url: 'https://mycarconcierge.com/founder-dashboard.html'
  });
}

async function sendFounderReferralSignupEmail(founderEmail, founderName, referralData) {
  return queueEmail(founderEmail, founderName, 'founder_referral_signup', {
    founder_name: founderName,
    referral_type: referralData.type === 'provider' ? 'Provider' : 'Member',
    referral_code: referralData.referral_code,
    signup_date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    is_provider: referralData.type === 'provider',
    provider_referrals: referralData.provider_referrals || 0,
    member_referrals: referralData.member_referrals || 0,
    total_earnings: parseFloat(referralData.total_earnings || 0).toFixed(2),
    dashboard_url: 'https://mycarconcierge.com/founder-dashboard.html'
  });
}

async function sendFounderPayoutProcessedEmail(founderEmail, founderName, payoutData) {
  return queueEmail(founderEmail, founderName, 'founder_payout_processed', {
    founder_name: founderName,
    payout_amount: parseFloat(payoutData.amount).toFixed(2),
    payout_period: payoutData.period,
    payout_method: payoutData.method,
    payout_date: new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    dashboard_url: 'https://mycarconcierge.com/founder-dashboard.html'
  });
}

async function sendFounderTierUpgradeEmail(founderEmail, founderName, tierData) {
  return queueEmail(founderEmail, founderName, 'founder_tier_upgrade', {
    founder_name: founderName,
    new_tier: tierData.new_tier,
    previous_tier: tierData.previous_tier,
    new_bid_pack_rate: tierData.new_bid_pack_rate,
    new_platform_fee_rate: tierData.new_platform_fee_rate,
    total_referrals: tierData.total_referrals || 0,
    total_earnings: parseFloat(tierData.total_earnings || 0).toFixed(2),
    months_active: tierData.months_active || 1,
    dashboard_url: 'https://mycarconcierge.com/founder-dashboard.html'
  });
}

async function sendFounderApprovedEmail(email, name, referralCode) {
  return queueEmail(email, name, 'founder_approved', {
    name: name,
    referral_code: referralCode,
    dashboard_url: 'https://mycarconcierge.com/founder-dashboard.html'
  });
}

/**
 * Create in-app notification
 */
async function createNotification(userId, type, title, message, linkType, linkId) {
  // Check if notification type is enabled for in-app
  const prefs = NotificationTypes[type];
  if (!prefs?.inApp) return null;
  
  // Insert into notifications table
  if (typeof supabaseClient !== 'undefined') {
    try {
      const { error } = await supabaseClient.from('notifications').insert({
        user_id: userId,
        type: type,
        title: title,
        message: message,
        link_type: linkType,
        link_id: linkId
      });
      
      if (error) console.error('[NOTIFICATION] Error:', error);
    } catch (err) {
      console.error('[NOTIFICATION] Error:', err);
    }
  }
  
  return { user_id: userId, type, title, message };
}

/**
 * Send push notification
 * In production, use Firebase Cloud Messaging or similar
 */
async function sendPushNotification(userId, title, body, data) {
  console.log('[PUSH] Would send to user:', userId, { title, body, data });
  
  return { success: true };
}

// Export for use
window.EmailService = {
  templates: EmailTemplates,
  notificationTypes: NotificationTypes,
  renderEmail,
  queueEmail,
  createNotification,
  sendPushNotification,
  // Email helper functions
  sendBidReceivedEmail,
  sendBidAcceptedEmail,
  sendWorkCompletedEmail,
  sendPaymentReceivedEmail,
  // Founder email functions
  sendFounderCommissionEarnedEmail,
  sendFounderReferralSignupEmail,
  sendFounderPayoutProcessedEmail,
  sendFounderTierUpgradeEmail,
  sendFounderApprovedEmail,
  // SMS functions
  queueSms,
  sendBidReceivedSms,
  sendBidAcceptedSms,
  sendWorkCompletedSms
};

// ========== SMS FUNCTIONS ==========

/**
 * Queue SMS for sending via Supabase
 */
async function queueSms(phone, message, notificationType, relatedId) {
  try {
    if (!phone) return { success: false, error: 'No phone number' };
    
    // Format phone number (ensure it has country code)
    let formattedPhone = phone.replace(/\D/g, '');
    if (formattedPhone.length === 10) {
      formattedPhone = '1' + formattedPhone; // Add US country code
    }
    formattedPhone = '+' + formattedPhone;

    if (typeof supabaseClient !== 'undefined') {
      const { error } = await supabaseClient.from('sms_queue').insert({
        to_phone: formattedPhone,
        message: message,
        notification_type: notificationType,
        related_id: relatedId || null,
        status: 'pending'
      });
      
      if (error) {
        console.error('[SMS] Queue error:', error);
        return { success: false, error: error.message };
      }
      
      console.log('[SMS] Queued:', { to: formattedPhone, type: notificationType });
      return { success: true };
    }
    
    return { success: false, error: 'No database connection' };
  } catch (err) {
    console.error('[SMS] Error:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Send SMS when member receives a new bid
 */
async function sendBidReceivedSms(phone, packageTitle, bidAmount) {
  const message = `MCC: New bid of $${bidAmount.toFixed(2)} received on "${packageTitle}". Log in to view details.`;
  return queueSms(phone, message, 'bid_received');
}

/**
 * Send SMS when provider's bid is accepted
 */
async function sendBidAcceptedSms(phone, packageTitle, bidAmount) {
  const message = `MCC: Your bid of $${bidAmount.toFixed(2)} for "${packageTitle}" was accepted! Log in to schedule the work.`;
  return queueSms(phone, message, 'bid_accepted');
}

/**
 * Send SMS when work is completed
 */
async function sendWorkCompletedSms(phone, packageTitle) {
  const message = `MCC: Work completed on "${packageTitle}". Log in to confirm and release payment.`;
  return queueSms(phone, message, 'work_completed');
}

/**
 * Send SMS when payment is released
 */
async function sendPaymentReleasedSms(phone, amount) {
  const message = `MCC: Payment of $${amount.toFixed(2)} has been released to your account!`;
  return queueSms(phone, message, 'payment_released');
}

/**
 * Send SMS when bidding is ending soon
 */
async function sendBiddingEndingSms(phone, packageTitle, hoursLeft) {
  const message = `MCC: Bidding on "${packageTitle}" ends in ${hoursLeft} hours. Log in to review your bids.`;
  return queueSms(phone, message, 'bidding_ending');
}
