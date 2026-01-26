/**
 * My Car Concierge - Email Templates & Notification System
 * 
 * This configuration file defines email templates and notification preferences.
 * In production, use a service like SendGrid, Mailgun, or AWS SES.
 * 
 * ============================================================================
 * TEMPLATE VARIABLES DOCUMENTATION
 * ============================================================================
 * 
 * DREAM CAR MATCH TEMPLATE (dream_car_match):
 * - {{member_name}}          : Member's display name
 * - {{vehicle_year}}         : Year of the matched vehicle (e.g., "2024")
 * - {{vehicle_make}}         : Make of the vehicle (e.g., "Porsche")
 * - {{vehicle_model}}        : Model of the vehicle (e.g., "911 Carrera")
 * - {{vehicle_trim}}         : Trim level (e.g., "GT3")
 * - {{vehicle_price}}        : Formatted price (e.g., "125,000")
 * - {{vehicle_mileage}}      : Mileage with commas (e.g., "12,500")
 * - {{vehicle_color}}        : Exterior color
 * - {{vehicle_image_url}}    : URL to vehicle image
 * - {{match_score}}          : AI match percentage (e.g., "95")
 * - {{match_reason_1}}       : First reason for match
 * - {{match_reason_2}}       : Second reason for match
 * - {{match_reason_3}}       : Third reason for match
 * - {{dealer_name}}          : Dealer/seller name
 * - {{dealer_location}}      : City, State location
 * - {{view_url}}             : URL to view vehicle in dashboard
 * - {{preferences_url}}      : URL to edit dream car preferences
 * 
 * MAINTENANCE REMINDER TEMPLATE (maintenance_reminder):
 * - {{member_name}}          : Member's display name
 * - {{vehicle_year}}         : Vehicle year
 * - {{vehicle_make}}         : Vehicle make
 * - {{vehicle_model}}        : Vehicle model
 * - {{vehicle_nickname}}     : User's nickname for vehicle (optional)
 * - {{service_type}}         : Type of service (e.g., "Oil Change", "Tire Rotation")
 * - {{service_icon}}         : Emoji icon for service type
 * - {{due_date}}             : Due date string (e.g., "January 25, 2026")
 * - {{due_mileage}}          : Due mileage (e.g., "45,000")
 * - {{current_mileage}}      : Current vehicle mileage
 * - {{urgency}}              : Urgency level ("due_soon", "overdue", "upcoming")
 * - {{days_until_due}}       : Days until service is due
 * - {{create_package_url}}   : URL to create maintenance package
 * - {{vehicle_url}}          : URL to view vehicle details
 * 
 * BID RECEIVED TEMPLATE (bid_received):
 * - {{name}}                 : Member's display name
 * - {{package_title}}        : Title of the maintenance package
 * - {{vehicle_name}}         : Vehicle description (year make model)
 * - {{bid_amount}}           : Bid amount formatted
 * - {{timeline}}             : Estimated completion timeline
 * - {{provider_rating}}      : Provider's average rating
 * - {{provider_reviews}}     : Number of reviews
 * - {{total_bids}}           : Total number of bids received
 * - {{package_url}}          : URL to view package and bids
 * 
 * COMMON FOOTER VARIABLES (auto-populated):
 * - {{unsubscribe_url}}      : Unsubscribe link
 * - {{preferences_url}}      : Email preferences link
 * - {{help_url}}             : Help center link
 * - {{current_year}}         : Current year for copyright
 * 
 * ============================================================================
 */

// ========== EMAIL TEMPLATES ==========

const EmailTemplates = {
  
  // ===== DREAM CAR FINDER EMAILS =====

  /**
   * Dream Car Match Email
   * Sent when AI finds a vehicle matching member's dream car preferences
   */
  dream_car_match: {
    subject: '🚗 Dream Car Alert: {{vehicle_year}} {{vehicle_make}} {{vehicle_model}} Found!',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #d4a855; font-size: 28px; margin: 0 0 8px 0;">Your Dream Car Has Been Found!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Our AI matched a vehicle to your preferences</p>
      </div>
      
      <div class="match-score-container" style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); border-radius: 50%; width: 100px; height: 100px; line-height: 100px; text-align: center;">
          <span style="font-size: 32px; font-weight: bold; color: #0a0a0f;">{{match_score}}%</span>
        </div>
        <p style="color: #d4a855; font-size: 14px; margin-top: 8px; font-weight: 600;">MATCH SCORE</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #2d2d44; padding: 0; overflow: hidden;">
        <div style="background: #12121c; padding: 20px; text-align: center;">
          <img src="{{vehicle_image_url}}" alt="{{vehicle_year}} {{vehicle_make}} {{vehicle_model}}" style="max-width: 100%; height: auto; border-radius: 8px; max-height: 250px; object-fit: cover;">
        </div>
        <div style="padding: 24px;">
          <h2 style="color: #ffffff; font-size: 24px; margin: 0 0 4px 0;">{{vehicle_year}} {{vehicle_make}} {{vehicle_model}}</h2>
          <p style="color: #9ca3af; font-size: 16px; margin: 0 0 16px 0;">{{vehicle_trim}} • {{vehicle_color}}</p>
          
          <div style="display: flex; justify-content: space-between; margin-bottom: 20px; flex-wrap: wrap; gap: 16px;">
            <div style="flex: 1; min-width: 120px;">
              <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Price</p>
              <p style="color: #d4a855; font-size: 24px; font-weight: bold; margin: 0;">\${{vehicle_price}}</p>
            </div>
            <div style="flex: 1; min-width: 120px;">
              <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Mileage</p>
              <p style="color: #ffffff; font-size: 24px; font-weight: bold; margin: 0;">{{vehicle_mileage}}</p>
            </div>
          </div>
          
          <div style="border-top: 1px solid #2d2d44; padding-top: 16px; margin-top: 16px;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Listed By</p>
            <p style="color: #ffffff; font-size: 16px; margin: 0;">{{dealer_name}}</p>
            <p style="color: #9ca3af; font-size: 14px; margin: 4px 0 0 0;">📍 {{dealer_location}}</p>
          </div>
        </div>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h3 style="color: #d4a855; font-size: 16px; margin: 0 0 16px 0;">✨ Why This Is A Great Match</h3>
        <ul style="list-style: none; padding: 0; margin: 0;">
          <li style="color: #e5e7eb; padding: 8px 0; border-bottom: 1px solid #2d2d44; display: flex; align-items: center;">
            <span style="color: #4ade80; margin-right: 12px;">✓</span> {{match_reason_1}}
          </li>
          <li style="color: #e5e7eb; padding: 8px 0; border-bottom: 1px solid #2d2d44; display: flex; align-items: center;">
            <span style="color: #4ade80; margin-right: 12px;">✓</span> {{match_reason_2}}
          </li>
          <li style="color: #e5e7eb; padding: 8px 0; display: flex; align-items: center;">
            <span style="color: #4ade80; margin-right: 12px;">✓</span> {{match_reason_3}}
          </li>
        </ul>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{view_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">View Vehicle Details</a>
      </div>
      
      <p style="text-align: center; color: #6b7280; font-size: 14px; margin-top: 24px;">
        Not what you're looking for? <a href="{{preferences_url}}" style="color: #4a7cff;">Update your preferences</a>
      </p>
    `
  },

  // ===== MAINTENANCE REMINDER EMAILS =====

  /**
   * Maintenance Reminder Email
   * Sent when a vehicle is due for scheduled maintenance
   */
  maintenance_reminder: {
    subject: '🔧 Maintenance Due: {{service_type}} for Your {{vehicle_year}} {{vehicle_make}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0;">Maintenance Reminder</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Keep your vehicle running at its best</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #2d2d44;">
        <div style="display: flex; align-items: center; margin-bottom: 20px;">
          <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #4a7cff 0%, #3d6ce0 100%); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-right: 16px;">
            <span style="font-size: 28px;">{{service_icon}}</span>
          </div>
          <div>
            <h2 style="color: #ffffff; font-size: 22px; margin: 0;">{{service_type}}</h2>
            <p style="color: #9ca3af; font-size: 14px; margin: 4px 0 0 0;">Scheduled Maintenance</p>
          </div>
        </div>
        
        <div style="background: #12121c; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
          <div style="display: flex; align-items: center; margin-bottom: 12px;">
            <span style="color: #4a7cff; font-size: 20px; margin-right: 12px;">🚗</span>
            <div>
              <p style="color: #6b7280; font-size: 12px; margin: 0; text-transform: uppercase;">Vehicle</p>
              <p style="color: #ffffff; font-size: 16px; margin: 0; font-weight: 600;">{{vehicle_year}} {{vehicle_make}} {{vehicle_model}}</p>
              {{#if vehicle_nickname}}<p style="color: #9ca3af; font-size: 14px; margin: 4px 0 0 0;">"{{vehicle_nickname}}"</p>{{/if}}
            </div>
          </div>
        </div>
        
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 140px; background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Due Date</p>
            <p style="color: #d4a855; font-size: 18px; font-weight: bold; margin: 0;">{{due_date}}</p>
            {{#if days_until_due}}<p style="color: #9ca3af; font-size: 12px; margin: 4px 0 0 0;">{{days_until_due}} days away</p>{{/if}}
          </div>
          <div style="flex: 1; min-width: 140px; background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Due Mileage</p>
            <p style="color: #4a7cff; font-size: 18px; font-weight: bold; margin: 0;">{{due_mileage}} mi</p>
            <p style="color: #9ca3af; font-size: 12px; margin: 4px 0 0 0;">Current: {{current_mileage}} mi</p>
          </div>
        </div>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); border: none; margin-top: 20px;">
        <h3 style="color: #0a0a0f; font-size: 18px; margin: 0 0 12px 0; font-weight: 700;">💡 Why This Matters</h3>
        <p style="color: #1a1a2e; font-size: 14px; margin: 0; line-height: 1.6;">
          Regular {{service_type}} helps extend the life of your vehicle, improves fuel efficiency, and prevents costly repairs down the road. Don't let this service slip!
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{create_package_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">Get Service Quotes</a>
        <p style="color: #9ca3af; font-size: 14px; margin-top: 12px;">Create a maintenance package and receive competitive bids</p>
      </div>
      
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{vehicle_url}}" style="color: #4a7cff; font-size: 14px;">View Vehicle Details →</a>
      </div>
    `
  },

  // ===== MEMBER EMAILS =====
  
  welcome_member: {
    subject: 'Welcome to My Car Concierge!',
    useCustomWrapper: true,
    template: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome to My Car Concierge</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fefdfb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fefdfb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px;">
          
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <span style="font-family: Georgia, serif; font-size: 26px; color: #1e3a5f;">
                My Car <span style="color: #b8942d;">Concierge</span>
              </span>
            </td>
          </tr>
          
          <!-- Main Content Box -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-top: 4px solid #b8942d;">
              
              <!-- Headline -->
              <h1 style="margin: 0 0 16px 0; font-size: 28px; font-weight: 600; color: #1e3a5f; text-align: center; line-height: 1.3;">
                Welcome to My Car Concierge, {{name}}!
              </h1>
              
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.7; color: #4a5568; text-align: center;">
                Thank you for joining! We're thrilled to have you as a new member. Below are some quick links to help you get started.
              </p>
              
              <!-- Quick Links Section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                
                <!-- Add Your Vehicle -->
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px; margin-bottom: 12px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50" valign="top">
                          <span style="font-size: 28px;">🚗</span>
                        </td>
                        <td>
                          <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #1e3a5f; font-weight: 600;">Add Your Vehicle</h3>
                          <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
                            Start by adding your vehicle to your Digital Garage. Track maintenance, store documents, and get personalized service recommendations.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 12px;"></td></tr>
                
                <!-- Get Service Quotes -->
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50" valign="top">
                          <span style="font-size: 28px;">💰</span>
                        </td>
                        <td>
                          <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #1e3a5f; font-weight: 600;">Get Competitive Bids</h3>
                          <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
                            Need a service? Create a maintenance package and receive anonymous bids from vetted providers who compete for your business.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 12px;"></td></tr>
                
                <!-- Car Care Academy -->
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50" valign="top">
                          <span style="font-size: 28px;">📚</span>
                        </td>
                        <td>
                          <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #1e3a5f; font-weight: 600;">Learn at Car Care Academy</h3>
                          <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
                            Become a smarter car owner with our educational resources covering maintenance tips, buying guides, and money-saving advice.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 12px;"></td></tr>
                
                <!-- Safe Payments -->
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50" valign="top">
                          <span style="font-size: 28px;">🔒</span>
                        </td>
                        <td>
                          <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #1e3a5f; font-weight: 600;">Pay with Confidence</h3>
                          <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
                            Your payment is held in escrow until you confirm the work is complete. No surprises, no hassle—just peace of mind.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="{{dashboard_url}}" 
                       style="display: inline-block; padding: 16px 48px; background-color: #b8942d; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Go to My Dashboard
                    </a>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 0; text-align: center;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
                Questions? Reply to this email or visit <a href="{{help_url}}" style="color: #1e3a5f; text-decoration: none;">our help center</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © {{current_year}} My Car Concierge · <a href="{{unsubscribe_url}}" style="color: #9ca3af; text-decoration: none;">Unsubscribe</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `
  },

  welcome_provider: {
    subject: 'Welcome to My Car Concierge - Provider Account Activated!',
    useCustomWrapper: true,
    template: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Welcome Provider - My Car Concierge</title>
</head>
<body style="margin: 0; padding: 0; background-color: #fefdfb; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fefdfb; padding: 40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width: 600px;">
          
          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom: 30px;">
              <span style="font-family: Georgia, serif; font-size: 26px; color: #1e3a5f;">
                My Car <span style="color: #b8942d;">Concierge</span>
              </span>
            </td>
          </tr>
          
          <!-- Main Content Box -->
          <tr>
            <td style="background-color: #ffffff; padding: 40px; border-radius: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); border-top: 4px solid #b8942d;">
              
              <!-- Headline -->
              <h1 style="margin: 0 0 16px 0; font-size: 28px; font-weight: 600; color: #1e3a5f; text-align: center; line-height: 1.3;">
                Welcome to My Car Concierge, {{name}}!
              </h1>
              
              <p style="margin: 0 0 30px 0; font-size: 16px; line-height: 1.7; color: #4a5568; text-align: center;">
                Your provider account is ready! Here's how to start winning new customers and growing your business.
              </p>
              
              <!-- Quick Links Section -->
              <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom: 24px;">
                
                <!-- Complete Your Profile -->
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50" valign="top">
                          <span style="font-size: 28px;">👤</span>
                        </td>
                        <td>
                          <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #1e3a5f; font-weight: 600;">Complete Your Profile</h3>
                          <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
                            Add your business details, service areas, specialties, and upload photos. Complete profiles get 3x more opportunities.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 12px;"></td></tr>
                
                <!-- Connect Stripe -->
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50" valign="top">
                          <span style="font-size: 28px;">💳</span>
                        </td>
                        <td>
                          <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #1e3a5f; font-weight: 600;">Connect Your Payment Account</h3>
                          <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
                            Link your Stripe account to receive payments directly. Funds are released as soon as customers confirm job completion.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 12px;"></td></tr>
                
                <!-- Start Bidding -->
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50" valign="top">
                          <span style="font-size: 28px;">🔨</span>
                        </td>
                        <td>
                          <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #1e3a5f; font-weight: 600;">Browse & Bid on Jobs</h3>
                          <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
                            View available maintenance packages in your area and submit competitive bids. Win customers by offering great prices and service.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr><td style="height: 12px;"></td></tr>
                
                <!-- Build Reputation -->
                <tr>
                  <td style="padding: 20px; background-color: #f8f9fa; border-radius: 8px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td width="50" valign="top">
                          <span style="font-size: 28px;">⭐</span>
                        </td>
                        <td>
                          <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #1e3a5f; font-weight: 600;">Build Your Reputation</h3>
                          <p style="margin: 0; font-size: 14px; color: #4a5568; line-height: 1.5;">
                            Deliver excellent service and earn positive reviews. Higher ratings mean more visibility and winning more bids.
                          </p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="{{dashboard_url}}" 
                       style="display: inline-block; padding: 16px 48px; background-color: #b8942d; color: #ffffff; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                      Go to Provider Dashboard
                    </a>
                  </td>
                </tr>
              </table>
              
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 0; text-align: center;">
              <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280;">
                Questions? Reply to this email or visit <a href="{{help_url}}" style="color: #1e3a5f; text-decoration: none;">our help center</a>
              </p>
              <p style="margin: 0; font-size: 12px; color: #9ca3af;">
                © {{current_year}} My Car Concierge · <a href="{{unsubscribe_url}}" style="color: #9ca3af; text-decoration: none;">Unsubscribe</a>
              </p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
    `
  },

  /**
   * Bid Received Email (Enhanced Dark Theme)
   * Sent when a member receives a new bid on their maintenance package
   */
  bid_received: {
    subject: '💰 New Bid on Your Maintenance Package: {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4ade80; font-size: 28px; margin: 0 0 8px 0;">You've Received a New Bid!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">A provider wants to help with your service</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #2d2d44;">
        <div style="border-bottom: 1px solid #2d2d44; padding-bottom: 16px; margin-bottom: 16px;">
          <h2 style="color: #ffffff; font-size: 22px; margin: 0 0 4px 0;">{{package_title}}</h2>
          <p style="color: #9ca3af; font-size: 14px; margin: 0;">{{vehicle_name}}</p>
        </div>
        
        <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 20px;">
          <div style="flex: 1; min-width: 140px; background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Bid Amount</p>
            <p style="color: #4ade80; font-size: 28px; font-weight: bold; margin: 0;">\${{bid_amount}}</p>
          </div>
          <div style="flex: 1; min-width: 140px; background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Timeline</p>
            <p style="color: #ffffff; font-size: 18px; font-weight: bold; margin: 0;">{{timeline}}</p>
          </div>
        </div>
        
        <div style="background: #12121c; border-radius: 8px; padding: 16px; display: flex; align-items: center; justify-content: space-between;">
          <div>
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Provider Rating</p>
            <p style="color: #d4a855; font-size: 20px; font-weight: bold; margin: 0;">
              {{provider_rating}} <span style="font-size: 16px;">⭐</span>
            </p>
          </div>
          <div style="text-align: right;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Total Bids</p>
            <p style="color: #4a7cff; font-size: 20px; font-weight: bold; margin: 0;">{{total_bids}}</p>
          </div>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{package_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">View All Bids</a>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #4a7cff; margin-top: 24px;">
        <p style="color: #4a7cff; font-size: 14px; margin: 0; text-align: center;">
          💡 <strong>Pro Tip:</strong> Wait for multiple bids to get the best value for your service!
        </p>
      </div>
    `
  },

  bidding_ending_soon: {
    subject: '⏰ Bidding Ends Soon: {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #f59e0b; font-size: 28px; margin: 0 0 8px 0;">⏰ Bidding Window Closing Soon!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Don't miss out on your best bids</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #f59e0b;">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0 0 4px 0;">{{package_title}}</h2>
        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 20px 0;">{{vehicle_name}}</p>
        
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 8px 0; text-transform: uppercase;">Ends</p>
            <p style="color: #f59e0b; font-size: 16px; font-weight: bold; margin: 0;">{{deadline}}</p>
          </div>
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 8px 0; text-transform: uppercase;">Time Left</p>
            <p style="color: #ef4444; font-size: 16px; font-weight: bold; margin: 0;">{{time_remaining}}</p>
          </div>
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 8px 0; text-transform: uppercase;">Bids</p>
            <p style="color: #4ade80; font-size: 16px; font-weight: bold; margin: 0;">{{total_bids}}</p>
          </div>
        </div>
      </div>
      
      <p style="color: #e5e7eb; text-align: center; margin-top: 24px;">Review your bids now and accept the best one before the window closes.</p>
      
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{package_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">Review Bids</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 20px;">After the deadline, you can still repost the package if you need more bids.</p>
    `
  },

  bidding_expired: {
    subject: 'Bidding Closed: {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0;">Bidding Window Closed</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Time to review your options</p>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44;">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0 0 4px 0;">{{package_title}}</h2>
        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 16px 0;">{{vehicle_name}}</p>
        <div style="background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
          <p style="color: #6b7280; font-size: 12px; margin: 0 0 4px 0; text-transform: uppercase;">Total Bids Received</p>
          <p style="color: #d4a855; font-size: 32px; font-weight: bold; margin: 0;">{{total_bids}}</p>
        </div>
      </div>
      
      {{#if has_bids}}
      <p style="color: #e5e7eb; text-align: center; margin-top: 24px;">You have <strong style="color: #4ade80;">{{total_bids}} bids</strong> to review. Accept a bid to proceed with service.</p>
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{package_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">Review & Accept a Bid</a>
      </div>
      {{else}}
      <p style="color: #e5e7eb; text-align: center; margin-top: 24px;">Unfortunately, no providers submitted bids during the window.</p>
      <p style="color: #9ca3af; text-align: center;">You can repost the package to try again with a new deadline.</p>
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{package_url}}" class="button-secondary" style="display: inline-block; background: #4a7cff; color: #ffffff !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">Repost Package</a>
      </div>
      {{/if}}
    `
  },

  new_message: {
    subject: 'New Message: {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #ffffff; font-size: 28px; margin: 0 0 8px 0;">💬 New Message</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">You have a new message regarding your service</p>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44;">
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="width: 48px; height: 48px; background: linear-gradient(135deg, #4a7cff 0%, #3d6ce0 100%); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 12px;">
            <span style="color: #ffffff; font-size: 20px; font-weight: bold;">{{sender_initial}}</span>
          </div>
          <div>
            <p style="color: #ffffff; font-size: 16px; font-weight: 600; margin: 0;">{{sender_name}}</p>
            <p style="color: #9ca3af; font-size: 14px; margin: 0;">Re: {{package_title}}</p>
          </div>
        </div>
        <div style="background: #12121c; border-radius: 8px; padding: 16px; border-left: 3px solid #4a7cff;">
          <p style="color: #e5e7eb; font-size: 15px; margin: 0; font-style: italic;">"{{message_preview}}"</p>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{message_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">View & Reply</a>
      </div>
    `
  },

  bid_accepted_member: {
    subject: '✅ Bid Accepted - {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4ade80; font-size: 28px; margin: 0 0 8px 0;">✅ Bid Accepted!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Your service is now scheduled</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #4ade80;">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0 0 4px 0;">{{package_title}}</h2>
        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 20px 0;">{{vehicle_name}}</p>
        
        <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
          <div style="flex: 1; min-width: 140px; background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Accepted Bid</p>
            <p style="color: #4ade80; font-size: 24px; font-weight: bold; margin: 0;">\${{bid_amount}}</p>
          </div>
          <div style="flex: 1; min-width: 140px; background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Provider</p>
            <p style="color: #ffffff; font-size: 16px; font-weight: bold; margin: 0;">{{provider_name}}</p>
          </div>
        </div>
        
        <div style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center;">
          <span style="color: #4ade80; font-size: 20px; margin-right: 12px;">🔒</span>
          <p style="color: #ffffff; font-size: 14px; margin: 0;"><strong>Payment Status:</strong> Held in Escrow</p>
        </div>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h3 style="color: #d4a855; font-size: 18px; margin: 0 0 16px 0;">📋 What's Next</h3>
        <ol style="padding-left: 20px; margin: 0; color: #e5e7eb;">
          <li style="margin-bottom: 12px;">The provider will contact you to schedule</li>
          <li style="margin-bottom: 12px;">Work will begin as agreed</li>
          <li style="margin-bottom: 12px;">Confirm completion when satisfied</li>
          <li>Payment released to provider</li>
        </ol>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{package_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Details</a>
      </div>
      
      <p style="color: #4a7cff; font-size: 14px; text-align: center; margin-top: 20px;">Your payment is protected until you confirm the work is complete.</p>
    `
  },

  work_started: {
    subject: '🔧 Work Has Started on {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4a7cff; font-size: 28px; margin: 0 0 8px 0;">🔧 Service In Progress!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Your provider has begun working</p>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #4a7cff;">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0 0 4px 0;">{{package_title}}</h2>
        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 20px 0;">{{vehicle_name}}</p>
        
        <div style="background: #12121c; border-radius: 8px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <span style="color: #6b7280;">Provider:</span>
            <span style="color: #ffffff; font-weight: 600;">{{provider_name}}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #6b7280;">Started:</span>
            <span style="color: #4a7cff; font-weight: 600;">{{start_time}}</span>
          </div>
        </div>
      </div>
      
      <p style="color: #e5e7eb; text-align: center; margin-top: 24px;">The provider is now working on your vehicle. You'll be notified when they mark the job as complete.</p>
      
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{package_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">Track Progress</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 20px;">Have questions? Message the provider through your dashboard.</p>
    `
  },

  work_completed: {
    subject: '✅ Action Required: Confirm Completion of {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4ade80; font-size: 28px; margin: 0 0 8px 0;">✅ Service Complete!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Please confirm to release payment</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #4ade80;">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0 0 4px 0;">{{package_title}}</h2>
        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 20px 0;">{{vehicle_name}}</p>
        
        <div style="background: #12121c; border-radius: 8px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <span style="color: #6b7280;">Provider:</span>
            <span style="color: #ffffff; font-weight: 600;">{{provider_name}}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <span style="color: #6b7280;">Completed:</span>
            <span style="color: #4ade80; font-weight: 600;">{{completion_time}}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #6b7280;">Amount:</span>
            <span style="color: #d4a855; font-weight: 600; font-size: 18px;">\${{amount}}</span>
          </div>
        </div>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h3 style="color: #ffffff; font-size: 18px; margin: 0 0 12px 0;">📋 Please Confirm Completion</h3>
        <p style="color: #e5e7eb; font-size: 14px; margin: 0;">Once you've received your vehicle and are satisfied with the work, please confirm completion to release payment.</p>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{confirm_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #4ade80 0%, #22c55e 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">Confirm & Release Payment</a>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #7c2d12 0%, #9a3412 100%); border: none; margin-top: 24px;">
        <p style="color: #fef2f2; font-size: 14px; margin: 0; text-align: center;">
          ⚠️ If you don't respond within 7 days, payment will be automatically released.
        </p>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 20px;">Not satisfied? You can open a dispute from your dashboard.</p>
    `
  },

  upsell_request: {
    subject: '⚠️ Action Required: Additional Work Found - {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #f59e0b; font-size: 28px; margin: 0 0 8px 0;">⚠️ Additional Issue Found</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Your provider discovered something during service</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #451a03 0%, #78350f 100%); border: 1px solid #f59e0b;">
        <h2 style="color: #fef3c7; font-size: 20px; margin: 0 0 12px 0;">{{issue_title}}</h2>
        <p style="color: #fde68a; font-size: 15px; margin: 0 0 20px 0;">{{issue_description}}</p>
        
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 100px; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #d4a855; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Urgency</p>
            <p style="color: #ffffff; font-size: 14px; font-weight: bold; margin: 0;">{{urgency}}</p>
          </div>
          <div style="flex: 1; min-width: 100px; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #d4a855; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Est. Cost</p>
            <p style="color: #4ade80; font-size: 14px; font-weight: bold; margin: 0;">\${{estimated_cost}}</p>
          </div>
          <div style="flex: 1; min-width: 100px; background: rgba(0,0,0,0.3); border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #d4a855; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Respond By</p>
            <p style="color: #ef4444; font-size: 14px; font-weight: bold; margin: 0;">{{deadline}}</p>
          </div>
        </div>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0;">Your Options:</h3>
        <ul style="list-style: none; padding: 0; margin: 0;">
          <li style="color: #e5e7eb; padding: 10px 0; border-bottom: 1px solid #2d2d44; display: flex; align-items: center;">
            <span style="color: #4ade80; margin-right: 12px; font-size: 18px;">✓</span>
            <div><strong style="color: #4ade80;">Approve:</strong> Add this work to your service</div>
          </li>
          <li style="color: #e5e7eb; padding: 10px 0; border-bottom: 1px solid #2d2d44; display: flex; align-items: center;">
            <span style="color: #ef4444; margin-right: 12px; font-size: 18px;">✕</span>
            <div><strong style="color: #ef4444;">Decline:</strong> Continue with original scope only</div>
          </li>
          <li style="color: #e5e7eb; padding: 10px 0; display: flex; align-items: center;">
            <span style="color: #4a7cff; margin-right: 12px; font-size: 18px;">📊</span>
            <div><strong style="color: #4a7cff;">Get Competing Bids:</strong> Create a new package for this issue</div>
          </li>
        </ul>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{respond_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">Review & Respond</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 20px;">You have 24 hours to respond. The original work will proceed regardless.</p>
    `
  },

  payment_released: {
    subject: '💰 Payment Confirmed - {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4ade80; font-size: 28px; margin: 0 0 8px 0;">💰 Payment Released!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Transaction completed successfully</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #4ade80;">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0 0 4px 0;">{{package_title}}</h2>
        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 20px 0;">{{vehicle_name}}</p>
        
        <div style="background: #12121c; border-radius: 8px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <span style="color: #6b7280;">Amount Paid:</span>
            <span style="color: #4ade80; font-weight: 600; font-size: 20px;">\${{amount}}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
            <span style="color: #6b7280;">Provider:</span>
            <span style="color: #ffffff; font-weight: 600;">{{provider_name}}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #6b7280;">Date:</span>
            <span style="color: #9ca3af;">{{date}}</span>
          </div>
        </div>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #d4a855; margin-top: 20px;">
        <h3 style="color: #d4a855; font-size: 18px; margin: 0 0 12px 0;">⭐ How Was Your Experience?</h3>
        <p style="color: #e5e7eb; font-size: 14px; margin: 0;">Your feedback helps other members choose the best providers.</p>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{review_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">Leave a Review</a>
      </div>
      
      <p style="color: #9ca3af; font-size: 14px; text-align: center; margin-top: 24px;">Thank you for using My Car Concierge!</p>
    `
  },

  // ===== PROVIDER EMAILS =====

  welcome_provider: {
    subject: 'Welcome to My Car Concierge - Application Received',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #d4a855; font-size: 28px; margin: 0 0 8px 0;">Thank You for Applying, {{business_name}}!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">We've received your provider application</p>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44;">
        <h2 style="color: #ffffff; font-size: 20px; margin: 0 0 20px 0;">📋 What Happens Next</h2>
        <ol style="padding-left: 20px; margin: 0; color: #e5e7eb;">
          <li style="margin-bottom: 16px; padding-left: 8px;">Our team reviews your credentials (1-3 business days)</li>
          <li style="margin-bottom: 16px; padding-left: 8px;">We verify your insurance and certifications</li>
          <li style="margin-bottom: 16px; padding-left: 8px;">You'll receive an approval email</li>
          <li style="margin-bottom: 16px; padding-left: 8px;">Set up your Stripe account for payments</li>
          <li style="padding-left: 8px;">Start receiving bid opportunities!</li>
        </ol>
      </div>
      
      <p style="color: #9ca3af; font-size: 14px; text-align: center; margin-top: 24px;">Need to update your application? Reply to this email.</p>
    `
  },

  provider_approved: {
    subject: '🎉 Congratulations! You\'re Now an MCC Provider',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4ade80; font-size: 28px; margin: 0 0 8px 0;">🎉 You're Approved, {{business_name}}!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Welcome to the My Car Concierge network</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); border: none;">
        <p style="color: #ffffff; font-size: 18px; text-align: center; margin: 0;">Your provider account is now active! Start receiving job opportunities today.</p>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h2 style="color: #d4a855; font-size: 20px; margin: 0 0 20px 0;">🚀 Get Started</h2>
        <ol style="padding-left: 20px; margin: 0; color: #e5e7eb;">
          <li style="margin-bottom: 16px; padding-left: 8px;"><strong style="color: #d4a855;">Set up payments:</strong> Connect your Stripe account</li>
          <li style="margin-bottom: 16px; padding-left: 8px;"><strong style="color: #d4a855;">Complete your profile:</strong> Add photos and specializations</li>
          <li style="margin-bottom: 16px; padding-left: 8px;"><strong style="color: #d4a855;">Browse opportunities:</strong> View open maintenance packages</li>
          <li style="padding-left: 8px;"><strong style="color: #d4a855;">Submit bids:</strong> Win jobs with competitive pricing</li>
        </ol>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{dashboard_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">Go to Provider Dashboard</a>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #4a7cff; margin-top: 24px;">
        <h3 style="color: #4a7cff; font-size: 16px; margin: 0 0 12px 0;">💡 How It Works</h3>
        <ul style="padding-left: 20px; margin: 0; color: #e5e7eb;">
          <li style="margin-bottom: 8px;">Members post anonymous maintenance packages</li>
          <li style="margin-bottom: 8px;">You submit competitive bids</li>
          <li style="margin-bottom: 8px;">Payment is held in escrow when bid accepted</li>
          <li>Complete the work, get paid (minus 7.5% MCC fee)</li>
        </ul>
      </div>
    `
  },

  bid_accepted_provider: {
    subject: '🎉 Your Bid Was Accepted! - {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4ade80; font-size: 28px; margin: 0 0 8px 0;">🎉 Congratulations! You Won the Job!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Your bid has been accepted</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); border: 1px solid #4ade80;">
        <h2 style="color: #ffffff; font-size: 22px; margin: 0 0 4px 0;">{{package_title}}</h2>
        <p style="color: #9ca3af; font-size: 14px; margin: 0 0 20px 0;">{{vehicle_info}}</p>
        
        <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 16px;">
          <div style="flex: 1; min-width: 140px; background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Your Bid</p>
            <p style="color: #ffffff; font-size: 24px; font-weight: bold; margin: 0;">\${{bid_amount}}</p>
          </div>
          <div style="flex: 1; min-width: 140px; background: #12121c; border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #6b7280; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">You'll Receive</p>
            <p style="color: #4ade80; font-size: 24px; font-weight: bold; margin: 0;">\${{provider_amount}}</p>
            <p style="color: #6b7280; font-size: 11px; margin: 4px 0 0 0;">after 7.5% fee</p>
          </div>
        </div>
        
        <div style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); border-radius: 8px; padding: 12px 16px; display: flex; align-items: center;">
          <span style="color: #4ade80; font-size: 20px; margin-right: 12px;">🔒</span>
          <p style="color: #ffffff; font-size: 14px; margin: 0;"><strong>Payment Status:</strong> Held in Escrow</p>
        </div>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h3 style="color: #d4a855; font-size: 18px; margin: 0 0 16px 0;">📋 Next Steps</h3>
        <ol style="padding-left: 20px; margin: 0; color: #e5e7eb;">
          <li style="margin-bottom: 12px;">Contact the member to schedule</li>
          <li style="margin-bottom: 12px;">Mark "Work Started" when you begin</li>
          <li style="margin-bottom: 12px;">Complete the agreed scope</li>
          <li style="margin-bottom: 12px;">Mark "Complete" when finished</li>
          <li>Payment released after member confirms</li>
        </ol>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{job_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Job Details</a>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #7c2d12 0%, #9a3412 100%); border: none; margin-top: 24px;">
        <p style="color: #fef2f2; font-size: 14px; margin: 0; text-align: center;">
          ⚠️ Important: Only charge for the agreed scope. Additional work requires member approval.
        </p>
      </div>
    `
  },

  payment_received: {
    subject: '💰 Payment Received - \${{amount}} - {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4ade80; font-size: 28px; margin: 0 0 8px 0;">💰 You've Been Paid!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Great work on completing the job</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); border: none;">
        <h2 style="color: #ffffff; font-size: 18px; margin: 0 0 16px 0;">{{package_title}}</h2>
        <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #a7f3d0;">Job Total:</span>
            <span style="color: #ffffff; font-weight: 600;">\${{total_amount}}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #a7f3d0;">MCC Fee (7.5%):</span>
            <span style="color: #fca5a5;">-\${{mcc_fee}}</span>
          </div>
          <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 8px; margin-top: 8px;">
            <span style="color: #ffffff; font-weight: 600;">Your Payment:</span>
            <span style="color: #4ade80; font-weight: bold; font-size: 20px;">\${{provider_amount}}</span>
          </div>
        </div>
      </div>
      
      <p style="color: #e5e7eb; text-align: center; margin-top: 24px;">The payment will be deposited to your connected bank account within 2-3 business days.</p>
      
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{earnings_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Earnings</a>
      </div>
      
      <p style="color: #9ca3af; font-size: 14px; text-align: center; margin-top: 24px;">Thank you for providing great service!</p>
    `
  },

  // ===== ADMIN/SYSTEM EMAILS =====

  dispute_opened: {
    subject: '[Action Required] Dispute Opened - {{package_title}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #ef4444; font-size: 28px; margin: 0 0 8px 0;">⚠️ Dispute Filed</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Action required</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #7c2d12 0%, #991b1b 100%); border: 1px solid #ef4444;">
        <h2 style="color: #fef2f2; font-size: 20px; margin: 0 0 16px 0;">{{package_title}}</h2>
        <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #fecaca;">Filed By:</span>
            <span style="color: #ffffff; font-weight: 600;">{{filed_by}}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #fecaca;">Reason:</span>
            <span style="color: #ffffff; font-weight: 600;">{{reason}}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #fecaca;">Amount:</span>
            <span style="color: #d4a855; font-weight: 600;">\${{amount}}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #fecaca;">Inspection Required:</span>
            <span style="color: #ffffff; font-weight: 600;">{{requires_inspection}}</span>
          </div>
        </div>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 12px 0;">Description:</h3>
        <p style="color: #e5e7eb; font-size: 14px; margin: 0; background: #12121c; padding: 16px; border-radius: 8px;">{{description}}</p>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{dispute_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: #ffffff !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">Review Dispute</a>
      </div>
    `
  },

  document_expiring: {
    subject: '⚠️ Action Required: Document Expiring Soon - {{document_type}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #f59e0b; font-size: 28px; margin: 0 0 8px 0;">📄 Document Expiring Soon</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Update required to maintain account status</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #78350f 0%, #92400e 100%); border: 1px solid #f59e0b;">
        <div style="display: flex; gap: 16px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 120px; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #fde68a; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Document</p>
            <p style="color: #ffffff; font-size: 16px; font-weight: bold; margin: 0;">{{document_type}}</p>
          </div>
          <div style="flex: 1; min-width: 120px; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #fde68a; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Expires</p>
            <p style="color: #ef4444; font-size: 16px; font-weight: bold; margin: 0;">{{expiration_date}}</p>
          </div>
          <div style="flex: 1; min-width: 120px; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 16px; text-align: center;">
            <p style="color: #fde68a; font-size: 12px; margin: 0 0 8px 0; text-transform: uppercase;">Days Left</p>
            <p style="color: #f59e0b; font-size: 16px; font-weight: bold; margin: 0;">{{days_remaining}}</p>
          </div>
        </div>
      </div>
      
      <p style="color: #e5e7eb; text-align: center; margin-top: 24px;">Please upload a new {{document_type}} before it expires to avoid account suspension.</p>
      
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{upload_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">Upload New Document</a>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #7c2d12 0%, #9a3412 100%); border: none; margin-top: 24px;">
        <p style="color: #fef2f2; font-size: 14px; margin: 0; text-align: center;">
          ⚠️ Your account will be automatically suspended if documents expire.
        </p>
      </div>
    `
  },

  // ===== FOUNDER COMMISSION EMAILS =====

  founder_commission_earned: {
    subject: '💰 You Earned a Commission - \${{commission_amount}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #d4a855; font-size: 28px; margin: 0 0 8px 0;">💰 Commission Earned!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Congratulations, {{founder_name}}!</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); border: none;">
        <h2 style="color: #0a0a0f; font-size: 18px; margin: 0 0 16px 0;">Commission Details</h2>
        <div style="background: rgba(0,0,0,0.15); border-radius: 8px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #1a1a2e;">Type:</span>
            <span style="color: #0a0a0f; font-weight: 600;">{{commission_type}}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #1a1a2e;">Original Amount:</span>
            <span style="color: #0a0a0f; font-weight: 600;">\${{original_amount}}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #1a1a2e;">Commission Rate:</span>
            <span style="color: #0a0a0f; font-weight: 600;">{{commission_rate}}%</span>
          </div>
          <div style="display: flex; justify-content: space-between; border-top: 1px solid rgba(0,0,0,0.2); padding-top: 8px; margin-top: 8px;">
            <span style="color: #0a0a0f; font-weight: 700;">Your Commission:</span>
            <span style="color: #0a0a0f; font-weight: bold; font-size: 24px;">\${{commission_amount}}</span>
          </div>
        </div>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0;">📊 Your Founder Stats</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Total Earnings</p>
            <p style="color: #4ade80; font-size: 16px; font-weight: bold; margin: 0;">\${{total_earnings}}</p>
          </div>
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Pending</p>
            <p style="color: #d4a855; font-size: 16px; font-weight: bold; margin: 0;">\${{pending_balance}}</p>
          </div>
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Referrals</p>
            <p style="color: #4a7cff; font-size: 16px; font-weight: bold; margin: 0;">{{total_referrals}}</p>
          </div>
        </div>
      </div>
      
      <p style="color: #e5e7eb; text-align: center; margin-top: 24px;">Keep sharing your referral code to earn more!</p>
      
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{dashboard_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Founder Dashboard</a>
      </div>
      
      <p style="color: #6b7280; font-size: 14px; text-align: center; margin-top: 20px;">Payouts are processed on the 15th of each month for balances of $25 or more.</p>
    `
  },

  founder_referral_signup: {
    subject: '🎉 New Referral Signup - {{referral_type}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4ade80; font-size: 28px; margin: 0 0 8px 0;">🎉 New Referral!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Great news, {{founder_name}}!</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); border: none;">
        <p style="color: #ffffff; font-size: 18px; text-align: center; margin: 0;">Someone just signed up using your referral code!</p>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h2 style="color: #d4a855; font-size: 18px; margin: 0 0 16px 0;">New {{referral_type}} Referral</h2>
        <div style="background: #12121c; border-radius: 8px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #6b7280;">Referral Code Used:</span>
            <span style="color: #d4a855; font-weight: 600; font-family: monospace;">{{referral_code}}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #6b7280;">Type:</span>
            <span style="color: #ffffff; font-weight: 600;">{{referral_type}}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #6b7280;">Date:</span>
            <span style="color: #9ca3af;">{{signup_date}}</span>
          </div>
        </div>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #4a7cff; margin-top: 20px;">
        <h3 style="color: #4a7cff; font-size: 16px; margin: 0 0 12px 0;">💰 What This Means For You</h3>
        <ul style="padding-left: 20px; margin: 0; color: #e5e7eb;">
          <li style="margin-bottom: 8px;">You'll earn <strong style="color: #4ade80;">50% commission</strong> on every service credit pack this provider purchases</li>
          <li style="margin-bottom: 8px;">Commission is automatically credited to your account</li>
          <li>This is a <strong style="color: #d4a855;">lifetime commission</strong> - earn on all their future purchases!</li>
        </ul>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0;">📊 Your Referral Stats</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Providers</p>
            <p style="color: #4a7cff; font-size: 16px; font-weight: bold; margin: 0;">{{provider_referrals}}</p>
          </div>
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Members</p>
            <p style="color: #d4a855; font-size: 16px; font-weight: bold; margin: 0;">{{member_referrals}}</p>
          </div>
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Earnings</p>
            <p style="color: #4ade80; font-size: 16px; font-weight: bold; margin: 0;">\${{total_earnings}}</p>
          </div>
        </div>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{dashboard_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Founder Dashboard</a>
      </div>
    `
  },

  founder_payout_processed: {
    subject: '💸 Payout Processed - \${{payout_amount}}',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4ade80; font-size: 28px; margin: 0 0 8px 0;">💸 Payout Processed!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Hi {{founder_name}}, your money is on its way</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #065f46 0%, #047857 100%); border: none;">
        <h2 style="color: #ffffff; font-size: 18px; margin: 0 0 16px 0;">Payout Details</h2>
        <div style="text-align: center; margin-bottom: 16px;">
          <p style="color: #4ade80; font-size: 48px; font-weight: bold; margin: 0;">\${{payout_amount}}</p>
        </div>
        <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 16px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #a7f3d0;">Period:</span>
            <span style="color: #ffffff; font-weight: 600;">{{payout_period}}</span>
          </div>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: #a7f3d0;">Method:</span>
            <span style="color: #ffffff; font-weight: 600;">{{payout_method}}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #a7f3d0;">Date:</span>
            <span style="color: #ffffff; font-weight: 600;">{{payout_date}}</span>
          </div>
        </div>
      </div>
      
      <p style="color: #e5e7eb; text-align: center; margin-top: 24px;">The funds should arrive in your account within 2-5 business days depending on your payment method.</p>
      
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{dashboard_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Payout History</a>
      </div>
      
      <p style="color: #9ca3af; font-size: 14px; text-align: center; margin-top: 24px;">Thank you for being a valued Member Founder!</p>
    `
  },

  founder_tier_upgrade: {
    subject: '🏆 Congratulations! You\'ve Reached {{new_tier}} Tier',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #d4a855; font-size: 28px; margin: 0 0 8px 0;">🏆 Tier Upgrade!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Hi {{founder_name}}, you've been upgraded!</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #d4a855 0%, #4a7cff 100%); border: none;">
        <h2 style="color: #ffffff; font-size: 24px; text-align: center; margin: 0 0 8px 0;">{{new_tier}} Tier</h2>
        <p style="color: rgba(255,255,255,0.8); text-align: center; margin: 0 0 16px 0;">Previous: {{previous_tier}}</p>
        <div style="background: rgba(0,0,0,0.2); border-radius: 8px; padding: 16px;">
          <p style="color: #ffffff; font-weight: 600; margin: 0 0 12px 0;">New Commission Rates:</p>
          <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
            <span style="color: rgba(255,255,255,0.8);">Service Credit Commission:</span>
            <span style="color: #ffffff; font-weight: bold;">{{new_bid_pack_rate}}%</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: rgba(255,255,255,0.8);">Platform Fee Commission:</span>
            <span style="color: #ffffff; font-weight: bold;">{{new_platform_fee_rate}}%</span>
          </div>
        </div>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 16px 0;">📊 How You Got Here</h3>
        <div style="display: flex; gap: 12px; flex-wrap: wrap;">
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Referrals</p>
            <p style="color: #4a7cff; font-size: 16px; font-weight: bold; margin: 0;">{{total_referrals}}</p>
          </div>
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Earnings</p>
            <p style="color: #4ade80; font-size: 16px; font-weight: bold; margin: 0;">\${{total_earnings}}</p>
          </div>
          <div style="flex: 1; min-width: 100px; background: #12121c; border-radius: 8px; padding: 12px; text-align: center;">
            <p style="color: #6b7280; font-size: 11px; margin: 0 0 4px 0; text-transform: uppercase;">Months Active</p>
            <p style="color: #d4a855; font-size: 16px; font-weight: bold; margin: 0;">{{months_active}}</p>
          </div>
        </div>
      </div>
      
      <p style="color: #e5e7eb; text-align: center; margin-top: 24px;">Keep up the great work! The more referrals you bring, the more you earn.</p>
      
      <div style="text-align: center; margin-top: 24px;">
        <a href="{{dashboard_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">View Founder Dashboard</a>
      </div>
    `
  },

  founder_approved: {
    subject: '🎉 Welcome to the My Car Concierge Founder Program!',
    template: `
      <div style="text-align: center; margin-bottom: 32px;">
        <h1 style="color: #4ade80; font-size: 28px; margin: 0 0 8px 0;">🎉 Welcome, Founder!</h1>
        <p style="color: #9ca3af; font-size: 16px; margin: 0;">Congratulations, {{name}}! You're approved!</p>
      </div>
      
      <div class="card" style="background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); border: none;">
        <h2 style="color: #0a0a0f; font-size: 18px; text-align: center; margin: 0 0 12px 0;">Your Unique Referral Code</h2>
        <p style="color: #0a0a0f; font-size: 32px; font-weight: bold; text-align: center; letter-spacing: 4px; margin: 0; font-family: monospace;">{{referral_code}}</p>
        <p style="color: #1a1a2e; font-size: 14px; text-align: center; margin: 12px 0 0 0;">Share this code with providers and earn commissions!</p>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #4ade80; margin-top: 20px;">
        <h3 style="color: #4ade80; font-size: 18px; margin: 0 0 12px 0;">💰 How You Earn</h3>
        <p style="color: #e5e7eb; font-size: 14px; margin: 0;">You earn <strong style="color: #4ade80;">50% commission</strong> on all service credit purchases from providers you refer. This is a <strong style="color: #d4a855;">lifetime commission</strong> — you'll continue earning on every service credit pack they purchase, forever!</p>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h3 style="color: #4a7cff; font-size: 18px; margin: 0 0 12px 0;">📱 Your Personal QR Code</h3>
        <p style="color: #e5e7eb; font-size: 14px; margin: 0 0 12px 0;">We've generated a unique QR code for you that makes sharing easy. Providers can simply scan it to sign up with your referral code already applied.</p>
        <p style="color: #9ca3af; font-size: 14px; margin: 0;"><strong>To find your QR code:</strong></p>
        <ol style="padding-left: 20px; margin: 12px 0 0 0; color: #e5e7eb;">
          <li style="margin-bottom: 8px;">Visit your Founder Dashboard</li>
          <li style="margin-bottom: 8px;">Look for the "Your Referral QR Code" section</li>
          <li>Download or share your QR code directly</li>
        </ol>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 20px;">
        <h3 style="color: #d4a855; font-size: 18px; margin: 0 0 16px 0;">🚀 Get Started</h3>
        <ol style="padding-left: 20px; margin: 0; color: #e5e7eb;">
          <li style="margin-bottom: 12px;"><strong>Visit your dashboard</strong> to view your referral tools and stats</li>
          <li style="margin-bottom: 12px;"><strong>Set up your payout method</strong> to receive your commission payments</li>
          <li style="margin-bottom: 12px;"><strong>Start sharing</strong> your referral code with auto service providers</li>
          <li><strong>Track your earnings</strong> as providers sign up and purchase service credits</li>
        </ol>
      </div>
      
      <div style="text-align: center; margin-top: 32px;">
        <a href="{{dashboard_url}}" class="button-primary" style="display: inline-block; background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%); color: #0a0a0f !important; text-decoration: none; padding: 16px 48px; border-radius: 8px; font-weight: 700; font-size: 16px;">Go to Founder Dashboard</a>
      </div>
      
      <div class="card" style="background: #1a1a2e; border: 1px solid #2d2d44; margin-top: 24px;">
        <h3 style="color: #ffffff; font-size: 16px; margin: 0 0 12px 0;">⚙️ Set Up Your Payout Method</h3>
        <p style="color: #e5e7eb; font-size: 14px; margin: 0;">To receive your commission payments, connect a payout method from your Founder Dashboard. <strong style="color: #d4a855;">Payouts are processed on the 15th of each month</strong> for balances of $25 or more.</p>
      </div>
      
      <p style="color: #9ca3af; font-size: 14px; text-align: center; margin-top: 24px;">We're excited to have you as a Member Founder. Your success is our success!</p>
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
  
  // Dream Car Finder notifications
  dream_car_match: { email: true, push: true, inApp: true },
  
  // Maintenance notifications
  maintenance_reminder: { email: true, push: true, inApp: true },
  
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
 * Dark-themed base email template wrapper
 * Creates a premium, luxury look consistent with the MCC brand
 * 
 * Style Guide:
 * - Primary Background: #0a0a0f (deep black)
 * - Secondary Background: #12121c (dark gray)
 * - Card Background: #1a1a2e (slate)
 * - Gold Accent: #d4a855 (CTAs, highlights)
 * - Blue Accent: #4a7cff (secondary elements)
 * - Text Primary: #ffffff
 * - Text Secondary: #9ca3af
 * - Text Muted: #6b7280
 * - Success: #4ade80
 * - Warning: #f59e0b
 * - Error: #ef4444
 */
function wrapInBaseTemplate(content) {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <title>My Car Concierge</title>
  <!--[if mso]>
  <style type="text/css">
    table { border-collapse: collapse; }
    .button-primary { padding: 16px 48px !important; }
  </style>
  <![endif]-->
  <style>
    /* Reset styles */
    body, table, td, div, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    img { -ms-interpolation-mode: bicubic; border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; }
    
    /* Base styles */
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #e5e7eb;
      background-color: #0a0a0f;
      margin: 0;
      padding: 0;
      width: 100%;
      -webkit-font-smoothing: antialiased;
    }
    
    /* Container */
    .email-wrapper {
      background-color: #0a0a0f;
      padding: 40px 20px;
    }
    
    .email-container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #12121c;
      border-radius: 16px;
      overflow: hidden;
      border: 1px solid #2d2d44;
    }
    
    /* Header */
    .email-header {
      background: linear-gradient(135deg, #1a1a2e 0%, #12121c 100%);
      padding: 32px 40px;
      text-align: center;
      border-bottom: 1px solid #2d2d44;
    }
    
    .logo {
      height: 48px;
      width: auto;
    }
    
    /* Content */
    .email-content {
      padding: 40px;
    }
    
    /* Typography */
    h1, h2, h3 { color: #ffffff; font-weight: 600; margin-top: 0; }
    h1 { font-size: 28px; line-height: 1.3; }
    h2 { font-size: 22px; line-height: 1.4; }
    h3 { font-size: 18px; line-height: 1.4; }
    
    p { color: #e5e7eb; margin: 0 0 16px 0; }
    
    a { color: #4a7cff; text-decoration: none; }
    a:hover { text-decoration: underline; }
    
    /* Cards */
    .card {
      background: #1a1a2e;
      border: 1px solid #2d2d44;
      border-radius: 12px;
      padding: 24px;
      margin: 20px 0;
    }
    
    /* Buttons */
    .button-primary {
      display: inline-block;
      background: linear-gradient(135deg, #d4a855 0%, #b8942d 100%);
      color: #0a0a0f !important;
      text-decoration: none !important;
      padding: 16px 48px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 16px;
      text-align: center;
      transition: all 0.2s ease;
    }
    
    .button-secondary {
      display: inline-block;
      background: #4a7cff;
      color: #ffffff !important;
      text-decoration: none !important;
      padding: 16px 48px;
      border-radius: 8px;
      font-weight: 700;
      font-size: 16px;
      text-align: center;
    }
    
    /* Footer */
    .email-footer {
      background: #0a0a0f;
      padding: 32px 40px;
      text-align: center;
      border-top: 1px solid #2d2d44;
    }
    
    .footer-logo {
      height: 32px;
      width: auto;
      margin-bottom: 16px;
    }
    
    .footer-text {
      color: #6b7280;
      font-size: 13px;
      margin: 0 0 12px 0;
    }
    
    .footer-links {
      margin: 16px 0;
    }
    
    .footer-links a {
      color: #9ca3af;
      font-size: 13px;
      margin: 0 12px;
      text-decoration: none;
    }
    
    .footer-links a:hover {
      color: #d4a855;
    }
    
    .social-links {
      margin: 20px 0;
    }
    
    .social-links a {
      display: inline-block;
      margin: 0 8px;
      color: #9ca3af;
      font-size: 14px;
    }
    
    .copyright {
      color: #4b5563;
      font-size: 12px;
      margin-top: 20px;
    }
    
    /* Utility */
    hr {
      border: none;
      border-top: 1px solid #2d2d44;
      margin: 20px 0;
    }
    
    ul, ol { padding-left: 20px; margin: 0; color: #e5e7eb; }
    li { margin-bottom: 8px; }
    
    /* Responsive */
    @media only screen and (max-width: 600px) {
      .email-wrapper { padding: 20px 12px; }
      .email-header { padding: 24px 20px; }
      .email-content { padding: 24px 20px; }
      .email-footer { padding: 24px 20px; }
      h1 { font-size: 24px; }
      h2 { font-size: 20px; }
      .button-primary, .button-secondary { 
        display: block; 
        width: 100%; 
        padding: 14px 24px;
        box-sizing: border-box;
      }
    }
  </style>
</head>
<body>
  <div class="email-wrapper">
    <div class="email-container">
      <!-- Header -->
      <div class="email-header">
        <img src="https://mycarconcierge.com/logo.png" alt="My Car Concierge" class="logo">
      </div>
      
      <!-- Content -->
      <div class="email-content">
        ${content}
      </div>
      
      <!-- Footer -->
      <div class="email-footer">
        <img src="https://mycarconcierge.com/logo.png" alt="MCC" class="footer-logo">
        
        <p class="footer-text">My Car Concierge - Your Trusted Auto Care Platform</p>
        
        <div class="footer-links">
          <a href="https://mycarconcierge.com/help">Help Center</a>
          <a href="https://mycarconcierge.com/privacy">Privacy</a>
          <a href="https://mycarconcierge.com/terms">Terms</a>
        </div>
        
        <div class="social-links">
          <a href="https://facebook.com/mycarconcierge">Facebook</a>
          <a href="https://twitter.com/mycarconcierge">Twitter</a>
          <a href="https://instagram.com/mycarconcierge">Instagram</a>
          <a href="https://linkedin.com/company/mycarconcierge">LinkedIn</a>
        </div>
        
        <div class="footer-links">
          <a href="{{unsubscribe_url}}" style="color: #6b7280;">Unsubscribe</a>
          <a href="{{preferences_url}}" style="color: #6b7280;">Email Preferences</a>
        </div>
        
        <p class="copyright">© ${new Date().getFullYear()} My Car Concierge, LLC. All rights reserved.</p>
        <p class="footer-text" style="font-size: 11px; color: #4b5563;">
          123 Auto Care Lane, Suite 100<br>
          Luxury Vehicle District, CA 90210
        </p>
      </div>
    </div>
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
async function sendBidReceivedEmail(memberEmail, memberName, packageTitle, vehicleName, bidAmount, totalBids, providerRating = '4.5', timeline = 'TBD') {
  return queueEmail(memberEmail, memberName, 'bid_received', {
    name: memberName,
    package_title: packageTitle,
    vehicle_name: vehicleName,
    bid_amount: bidAmount.toFixed(2),
    timeline: timeline,
    provider_rating: providerRating,
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

// ===== DREAM CAR FINDER EMAIL HELPER FUNCTIONS =====

/**
 * Send dream car match notification email
 * 
 * @param {string} memberEmail - Member's email address
 * @param {string} memberName - Member's display name
 * @param {object} vehicleData - Vehicle details object
 * @param {object} matchData - Match score and reasons
 */
async function sendDreamCarMatchEmail(memberEmail, memberName, vehicleData, matchData) {
  return queueEmail(memberEmail, memberName, 'dream_car_match', {
    member_name: memberName,
    vehicle_year: vehicleData.year,
    vehicle_make: vehicleData.make,
    vehicle_model: vehicleData.model,
    vehicle_trim: vehicleData.trim || '',
    vehicle_price: vehicleData.price ? vehicleData.price.toLocaleString() : 'Contact for Price',
    vehicle_mileage: vehicleData.mileage ? vehicleData.mileage.toLocaleString() : 'N/A',
    vehicle_color: vehicleData.color || 'N/A',
    vehicle_image_url: vehicleData.image_url || 'https://mycarconcierge.com/placeholder-car.jpg',
    match_score: matchData.score || 95,
    match_reason_1: matchData.reasons?.[0] || 'Matches your preferred make and model',
    match_reason_2: matchData.reasons?.[1] || 'Within your budget range',
    match_reason_3: matchData.reasons?.[2] || 'Low mileage for the year',
    dealer_name: vehicleData.dealer_name || 'Private Seller',
    dealer_location: vehicleData.location || 'Contact for Location',
    view_url: `https://mycarconcierge.com/members.html#dream-car/${vehicleData.id || ''}`,
    preferences_url: 'https://mycarconcierge.com/members.html#dream-car-preferences'
  });
}

// ===== MAINTENANCE REMINDER EMAIL HELPER FUNCTIONS =====

/**
 * Get icon for service type
 */
function getServiceIcon(serviceType) {
  const icons = {
    'oil change': '🛢️',
    'tire rotation': '🔄',
    'brake inspection': '🛑',
    'air filter': '💨',
    'transmission': '⚙️',
    'coolant flush': '❄️',
    'spark plugs': '⚡',
    'battery': '🔋',
    'alignment': '↔️',
    'inspection': '🔍',
    'default': '🔧'
  };
  
  const key = serviceType.toLowerCase();
  for (const [type, icon] of Object.entries(icons)) {
    if (key.includes(type)) return icon;
  }
  return icons.default;
}

/**
 * Send maintenance reminder email
 * 
 * @param {string} memberEmail - Member's email address
 * @param {string} memberName - Member's display name
 * @param {object} vehicleData - Vehicle details
 * @param {object} maintenanceData - Maintenance details
 */
async function sendMaintenanceReminderEmail(memberEmail, memberName, vehicleData, maintenanceData) {
  const dueDate = new Date(maintenanceData.due_date);
  const today = new Date();
  const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
  
  return queueEmail(memberEmail, memberName, 'maintenance_reminder', {
    member_name: memberName,
    vehicle_year: vehicleData.year,
    vehicle_make: vehicleData.make,
    vehicle_model: vehicleData.model,
    vehicle_nickname: vehicleData.nickname || '',
    service_type: maintenanceData.service_type,
    service_icon: getServiceIcon(maintenanceData.service_type),
    due_date: dueDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    due_mileage: maintenanceData.due_mileage ? maintenanceData.due_mileage.toLocaleString() : 'N/A',
    current_mileage: vehicleData.current_mileage ? vehicleData.current_mileage.toLocaleString() : 'N/A',
    urgency: daysUntilDue < 0 ? 'overdue' : daysUntilDue <= 7 ? 'due_soon' : 'upcoming',
    days_until_due: Math.abs(daysUntilDue),
    create_package_url: `https://mycarconcierge.com/members.html#create-package?vehicle=${vehicleData.id || ''}&service=${encodeURIComponent(maintenanceData.service_type)}`,
    vehicle_url: `https://mycarconcierge.com/members.html#vehicle/${vehicleData.id || ''}`
  });
}

// ===== FOUNDER EMAIL HELPER FUNCTIONS =====

async function sendFounderCommissionEarnedEmail(founderEmail, founderName, commissionData) {
  return queueEmail(founderEmail, founderName, 'founder_commission_earned', {
    founder_name: founderName,
    commission_type: commissionData.type === 'bid_pack' ? 'Service Credit Purchase' : 'Platform Fee',
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
  wrapInBaseTemplate,
  queueEmail,
  createNotification,
  sendPushNotification,
  // Email helper functions
  sendBidReceivedEmail,
  sendBidAcceptedEmail,
  sendWorkCompletedEmail,
  sendPaymentReceivedEmail,
  // Dream Car Finder functions
  sendDreamCarMatchEmail,
  // Maintenance Reminder functions
  sendMaintenanceReminderEmail,
  getServiceIcon,
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

/**
 * Send SMS for dream car match
 */
async function sendDreamCarMatchSms(phone, vehicleInfo) {
  const message = `MCC: 🚗 Dream Car Alert! We found a ${vehicleInfo}. Log in to view details.`;
  return queueSms(phone, message, 'dream_car_match');
}

/**
 * Send SMS for maintenance reminder
 */
async function sendMaintenanceReminderSms(phone, serviceType, vehicleName) {
  const message = `MCC: 🔧 Reminder: ${serviceType} is due for your ${vehicleName}. Log in to get service quotes.`;
  return queueSms(phone, message, 'maintenance_reminder');
}
