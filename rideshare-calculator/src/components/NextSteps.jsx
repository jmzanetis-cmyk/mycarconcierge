import React, { useState } from 'react';
import { ArrowRight, Shield, AlertCircle, Wrench, BookOpen, ExternalLink, Car, RefreshCw } from 'lucide-react';

const PathwaySection = ({ title, description, children }) => (
  <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border-2 border-indigo-200 rounded-lg p-6 mb-6">
    <h3 className="text-2xl font-bold text-indigo-900 mb-2">{title}</h3>
    <p className="text-indigo-700 mb-4">{description}</p>
    {children}
  </div>
);

const PlatformAlternativeCard = ({ name, type, earning, bestFor, pros, cons }) => (
  <div className="bg-white rounded-lg p-4 border border-gray-200 hover:border-teal-400 transition-colors">
    <div className="flex justify-between items-start mb-2">
      <h4 className="font-bold text-gray-800">{name}</h4>
      <span className="text-xs bg-teal-100 text-teal-700 px-2 py-1 rounded">{type}</span>
    </div>
    <p className="text-green-600 font-semibold text-sm mb-2">{earning}</p>
    <p className="text-xs text-gray-500 mb-2">Best for: {bestFor}</p>
    <div className="text-xs space-y-1">
      {pros.map((pro, i) => <p key={i} className="text-green-700">✓ {pro}</p>)}
      {cons.map((con, i) => <p key={i} className="text-yellow-700">⚠ {con}</p>)}
    </div>
  </div>
);

const LegalDisclaimer = () => (
  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mt-6">
    <h4 className="font-semibold text-gray-700 text-sm mb-2">Important Disclaimers</h4>
    <div className="text-xs text-gray-600 space-y-2">
      <p><strong>General Information Only:</strong> This calculator provides estimates for educational purposes only. It is not financial, legal, tax, or insurance advice. Actual earnings vary significantly based on location, time, demand, and other factors.</p>
      <p><strong>No Guarantee of Earnings:</strong> Past performance and estimates do not guarantee future results. Platform terms, fees, and policies may change without notice.</p>
      <p><strong>Third-Party Platforms:</strong> My Car Concierge is not affiliated with Uber, Lyft, Turo, HyreCar, Amazon, DoorDash, or any other platform mentioned. Verify all information directly with each platform.</p>
      <p><strong>Insurance:</strong> You are solely responsible for maintaining appropriate insurance coverage. Consult a licensed insurance professional in your state.</p>
      <p><strong>Tax Information:</strong> Consult a qualified tax professional for advice specific to your situation.</p>
      <p className="text-red-600 font-medium mt-2">LIMITATION OF LIABILITY: My Car Concierge and Zanetis Holdings LLC shall not be liable for any damages resulting from use of this calculator or related services.</p>
      <p className="mt-2 italic">By using this calculator, you acknowledge and agree to these disclaimers.</p>
      <p className="text-gray-500 mt-2">© 2025 Zanetis Holdings LLC d/b/a My Car Concierge. All rights reserved.</p>
    </div>
  </div>
);

const NextSteps = ({ results, riskScore, insuranceKey, inputs }) => {
  const [showAlternatives, setShowAlternatives] = useState(false);
  
  const isProfitable = results.profit > 0;
  const isBareProfitable = results.profit > 0 && results.profit < 5;
  const hasWrongInsurance = insuranceKey === 'personal';
  const hourlyBelowMinWage = results.hourlyRate < 15;
  const isLosingMoney = !isProfitable;

  const platformAlternatives = [
    { name: 'Turo', type: 'Car Rental', earning: '$500-$1,500+/mo', bestFor: 'Newer vehicles, part-time', pros: ['Passive income', 'Set your prices'], cons: ['Requires desirable vehicle', 'Renter damage risk'] },
    { name: 'HyreCar', type: 'Rent to Drivers', earning: '$200-$400/week', bestFor: 'Extra vehicles', pros: ['Steady income', 'Verified drivers'], cons: ['High mileage', 'Must meet requirements'] },
    { name: 'Amazon Flex', type: 'Delivery', earning: '$18-$25/hr', bestFor: 'Any vehicle', pros: ['Scheduled blocks', 'No passengers'], cons: ['Physical work', 'Competitive'] },
    { name: 'GoShare/Dolly', type: 'Moving', earning: '$30-$60/hr', bestFor: 'Trucks/Vans', pros: ['Higher rates', 'Less competition'], cons: ['Large vehicle needed', 'Heavy lifting'] },
    { name: 'Getaround', type: 'Hourly Rental', earning: '$300-$800/mo', bestFor: 'Urban areas', pros: ['More transactions', 'Keyless tech'], cons: ['Limited markets', 'Lower per-rental'] },
  ];

  const losingMoneyPath = () => (
    <PathwaySection
      title="You're Losing Money - Critical Decision Time"
      description={`You're losing $${Math.abs(results.profit).toFixed(2)} per trip. Here are your paths forward:`}
    >
      <div className="grid md:grid-cols-3 gap-4">
        <div className="bg-white rounded-lg p-5 border-2 border-red-300">
          <h4 className="text-lg font-bold text-red-800 mb-3 flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Path A: Exit Rideshare
          </h4>
          <p className="text-gray-700 mb-3 text-sm">
            Stop the bleeding. Find better opportunities.
          </p>
          <ul className="text-sm space-y-2 text-gray-600">
            <li>• Stop accepting rides</li>
            <li>• Find W-2 or better gig work</li>
            <li>• Maximize tax deductions</li>
            <li>• Sell vehicle while it has value</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg p-5 border-2 border-yellow-300">
          <h4 className="text-lg font-bold text-yellow-800 mb-3 flex items-center gap-2">
            <Wrench className="w-5 h-5" />
            Path B: Fix & Optimize
          </h4>
          <p className="text-gray-700 mb-3 text-sm">
            Make major changes to flip profitable:
          </p>
          <ul className="text-sm space-y-2 text-gray-600">
            <li>• Cut maintenance 40% (MCC)</li>
            <li>• Multi-app strategy</li>
            <li>• Peak hours only</li>
            <li>• 30-day test period</li>
          </ul>
        </div>

        <div className="bg-white rounded-lg p-5 border-2 border-teal-300">
          <h4 className="text-lg font-bold text-teal-800 mb-3 flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Path C: Switch Platforms
          </h4>
          <p className="text-gray-700 mb-3 text-sm">
            Your vehicle might earn more elsewhere:
          </p>
          <ul className="text-sm space-y-2 text-gray-600">
            <li>• Turo: Rent when not driving</li>
            <li>• HyreCar: Rent to other drivers</li>
            <li>• Delivery: Amazon Flex, DoorDash</li>
            <li>• Compare all options below</li>
          </ul>
        </div>
      </div>

      <button
        onClick={() => setShowAlternatives(!showAlternatives)}
        className="mt-4 w-full bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2"
      >
        <Car className="w-5 h-5" />
        {showAlternatives ? 'Hide' : 'Show'} Platform Alternatives
      </button>

      {showAlternatives && (
        <div className="mt-4 grid md:grid-cols-3 lg:grid-cols-5 gap-3">
          {platformAlternatives.map((platform, idx) => (
            <PlatformAlternativeCard key={idx} {...platform} />
          ))}
        </div>
      )}

      <div className="mt-4 bg-blue-600 text-white rounded-lg p-4">
        <p className="font-bold mb-1">Whatever path you choose, My Car Concierge can help</p>
        <p className="text-sm text-blue-100">Lower maintenance costs work for ANY platform - rideshare, rental, or delivery.</p>
      </div>
    </PathwaySection>
  );

  const barelyProfitablePath = () => (
    <PathwaySection
      title="Your Margins Are Razor-Thin - Time to Optimize"
      description={`At $${results.hourlyRate.toFixed(2)}/hr, you're one breakdown away from losing money.`}
    >
      <div className="space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-5 border-2 border-blue-300">
            <h4 className="text-lg font-bold text-blue-900 mb-2">Win #1: Cut Costs 40%</h4>
            <p className="text-sm text-gray-600 mb-3">Switch to My Car Concierge's competitive marketplace.</p>
            <p className="text-green-600 font-semibold text-sm">Potential: +$2-3/hour</p>
          </div>
          
          <div className="bg-white rounded-lg p-5 border-2 border-teal-300">
            <h4 className="text-lg font-bold text-teal-900 mb-2">Win #2: Evaluate Alternatives</h4>
            <p className="text-sm text-gray-600 mb-3">Would Turo or delivery earn more with your vehicle?</p>
            <p className="text-green-600 font-semibold text-sm">Compare below</p>
          </div>
          
          <div className="bg-white rounded-lg p-5 border-2 border-purple-300">
            <h4 className="text-lg font-bold text-purple-900 mb-2">Win #3: Multi-App</h4>
            <p className="text-sm text-gray-600 mb-3">Run 2-3 platforms to eliminate dead time.</p>
            <p className="text-green-600 font-semibold text-sm">Potential: +30-50% earnings</p>
          </div>
        </div>

        <button
          onClick={() => setShowAlternatives(!showAlternatives)}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2"
        >
          <Car className="w-5 h-5" />
          {showAlternatives ? 'Hide' : 'Compare'} Platform Alternatives
        </button>

        {showAlternatives && (
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-3">
            {platformAlternatives.map((platform, idx) => (
              <PlatformAlternativeCard key={idx} {...platform} />
            ))}
          </div>
        )}

        <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg p-4">
          <h4 className="font-bold mb-2">30-Day Optimization Sprint</h4>
          <div className="grid md:grid-cols-4 gap-2 text-sm">
            <div><strong>Week 1:</strong> Join MCC, research alternatives</div>
            <div><strong>Week 2:</strong> Book maintenance, start multi-apping</div>
            <div><strong>Week 3:</strong> Test different zones/hours</div>
            <div><strong>Week 4:</strong> Compare results, decide path</div>
          </div>
        </div>
      </div>
    </PathwaySection>
  );

  const profitablePath = () => (
    <PathwaySection
      title="You're Profitable - Now Scale Your Success"
      description={`At $${results.hourlyRate.toFixed(2)}/hr, you're making money. Here's how to grow:`}
    >
      <div className="space-y-4">
        <div className="grid md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg p-5 border-2 border-green-300">
            <h4 className="text-lg font-bold text-green-900 mb-2">Maximize Rideshare</h4>
            <p className="text-sm text-gray-600 mb-3">Focus on peak hours. 25 hrs of peak beats 40 hrs mixed.</p>
            <p className="text-sm text-gray-600">Target: Airport runs, business districts, surge times</p>
          </div>
          
          <div className="bg-white rounded-lg p-5 border-2 border-teal-300">
            <h4 className="text-lg font-bold text-teal-900 mb-2">Add Passive Income</h4>
            <p className="text-sm text-gray-600 mb-3">List on Turo during off-hours for additional revenue.</p>
            <p className="text-green-600 font-semibold text-sm">Potential: $500-1,500/mo extra</p>
          </div>
          
          <div className="bg-white rounded-lg p-5 border-2 border-purple-300">
            <h4 className="text-lg font-bold text-purple-900 mb-2">Build a Fleet</h4>
            <p className="text-sm text-gray-600 mb-3">Add vehicles, recruit drivers, scale operations.</p>
            <p className="text-green-600 font-semibold text-sm">15-20% passive per vehicle</p>
          </div>
        </div>

        <button
          onClick={() => setShowAlternatives(!showAlternatives)}
          className="w-full bg-teal-600 hover:bg-teal-700 text-white px-4 py-3 rounded-lg font-medium flex items-center justify-center gap-2"
        >
          <Car className="w-5 h-5" />
          {showAlternatives ? 'Hide' : 'Explore'} Additional Income Streams
        </button>

        {showAlternatives && (
          <div className="grid md:grid-cols-3 lg:grid-cols-5 gap-3">
            {platformAlternatives.map((platform, idx) => (
              <PlatformAlternativeCard key={idx} {...platform} />
            ))}
          </div>
        )}

        <div className="bg-gradient-to-r from-green-600 to-emerald-700 text-white rounded-lg p-4">
          <h4 className="font-bold mb-2">Keep Optimizing Your Foundation</h4>
          <p className="text-sm text-green-100">Even profitable drivers save money with My Car Concierge. Lower costs = higher margins = faster scaling.</p>
        </div>
      </div>
    </PathwaySection>
  );

  if (hasWrongInsurance) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
        <div className="border-b pb-4">
          <h2 className="text-2xl font-bold text-gray-800">URGENT: Insurance Risk</h2>
          <p className="text-gray-600 mt-1">You must fix this before anything else</p>
        </div>

        <div className="bg-red-50 border-2 border-red-500 rounded-lg p-6">
          <div className="flex items-start gap-4">
            <Shield className="w-12 h-12 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-2xl font-bold text-red-800 mb-2">STOP DRIVING IMMEDIATELY</h3>
              <p className="text-red-900 font-semibold mb-3">
                You're driving with personal insurance that does NOT cover rideshare or delivery. One accident could:
              </p>
              <ul className="space-y-2 text-red-800 list-disc ml-4 mb-4">
                <li>Result in a denied claim ($20,000-$50,000+ out of pocket)</li>
                <li>Leave you liable for passenger injuries</li>
                <li>Cause your policy to be cancelled</li>
                <li>Lead to lawsuits that could bankrupt you</li>
              </ul>
              <div className="bg-white border-2 border-red-300 rounded-lg p-4 mb-4">
                <p className="font-bold text-red-900 mb-2">REQUIRED NEXT STEPS:</p>
                <ol className="space-y-2 text-red-800 list-decimal ml-4">
                  <li><strong>Today:</strong> Stop accepting rides/deliveries</li>
                  <li><strong>This Week:</strong> Contact 3+ insurance providers for rideshare quotes</li>
                  <li><strong>Required Coverage:</strong> Rideshare endorsement OR commercial policy</li>
                  <li><strong>Cost:</strong> Expect $30-80/month additional for proper coverage</li>
                </ol>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-gray-600 italic">
          Come back and complete this calculator after you've secured proper insurance coverage.
        </p>

        <LegalDisclaimer />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <div className="border-b pb-4">
        <h2 className="text-2xl font-bold text-gray-800">Your Personalized Action Plan</h2>
        <p className="text-gray-600 mt-1">Based on your ${results.hourlyRate.toFixed(2)}/hr effective rate</p>
      </div>

      {isLosingMoney && losingMoneyPath()}
      {!isLosingMoney && (isBareProfitable || hourlyBelowMinWage) && barelyProfitablePath()}
      {!isLosingMoney && !isBareProfitable && !hourlyBelowMinWage && profitablePath()}

      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 text-white rounded-lg p-6">
        <div className="flex items-start gap-4">
          <Wrench className="w-12 h-12 flex-shrink-0" />
          <div className="flex-1">
            <h3 className="text-2xl font-bold mb-2">Lower Your Costs with My Car Concierge</h3>
            <p className="text-blue-100 mb-4">
              Join drivers who save 30-40% on vehicle maintenance through our competitive marketplace. 
              Works for ANY platform - rideshare, rental, or delivery.
            </p>
            <div className="bg-blue-800 bg-opacity-50 rounded-lg p-4 mb-4">
              <p className="font-bold mb-2">Your Potential Savings:</p>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Monthly maintenance: <strong>${(results.costs.maintenance * 20).toFixed(2)}</strong></div>
                <div>With MCC (35% off): <strong>${((results.costs.maintenance * 20) * 0.65).toFixed(2)}</strong></div>
                <div>Monthly savings: <strong className="text-green-300">${((results.costs.maintenance * 20) * 0.35).toFixed(2)}</strong></div>
                <div>Annual savings: <strong className="text-green-300">${((results.costs.maintenance * 20) * 0.35 * 12).toFixed(2)}</strong></div>
              </div>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <button
                onClick={() => window.open('https://mycarconcierge.com/signup', '_blank')}
                className="bg-white text-blue-600 px-6 py-4 rounded-lg font-bold hover:bg-gray-100 transition-colors flex items-center justify-center gap-2"
              >
                Join Free <ExternalLink className="w-5 h-5" />
              </button>
              <button
                onClick={() => window.open('https://mycarconcierge.com/how-it-works', '_blank')}
                className="border-2 border-white text-white hover:bg-white hover:text-blue-600 px-6 py-4 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
              >
                See How It Works <BookOpen className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      <LegalDisclaimer />
    </div>
  );
};

export default NextSteps;
