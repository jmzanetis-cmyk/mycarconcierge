import React from 'react';
import { AlertTriangle, Shield, Info } from 'lucide-react';
import { riskFactors, rideshareplatforms, insuranceTypes } from '../data/platforms';

const RiskAnalysis = ({ inputs, platformKey, insuranceKey }) => {
  const platform = rideshareplatforms[platformKey];
  const insurance = insuranceTypes[insuranceKey];
  
  const calculateRiskScore = () => {
    let score = 0;
    
    if (insuranceKey === 'personal') score += 40;
    else if (insuranceKey === 'rideshare_addon') score += 20;
    else if (insuranceKey === 'hybrid') score += 10;
    
    if (platform.riskFactors.deactivationRisk === 'high') score += 20;
    else if (platform.riskFactors.deactivationRisk === 'medium') score += 10;
    
    if (inputs.vehicleAge > 10) score += 20;
    else if (inputs.vehicleAge > 5) score += 10;
    
    if (inputs.annualMiles > 30000) score += 20;
    else if (inputs.annualMiles > 20000) score += 10;
    
    return score;
  };

  const riskScore = calculateRiskScore();
  
  const getRiskLevel = (score) => {
    if (score <= 20) return { level: 'LOW', color: 'green', description: 'Well-managed' };
    if (score <= 40) return { level: 'MODERATE', color: 'yellow', description: 'Some risks' };
    if (score <= 60) return { level: 'HIGH', color: 'orange', description: 'Significant exposure' };
    return { level: 'CRITICAL', color: 'red', description: 'Take action now' };
  };

  const risk = getRiskLevel(riskScore);

  const getRiskColorClasses = (color) => {
    const colorMap = {
      green: { bg: 'bg-green-50', border: 'border-green-500', text: 'text-green-600' },
      yellow: { bg: 'bg-yellow-50', border: 'border-yellow-500', text: 'text-yellow-600' },
      orange: { bg: 'bg-orange-50', border: 'border-orange-500', text: 'text-orange-600' },
      red: { bg: 'bg-red-50', border: 'border-red-500', text: 'text-red-600' }
    };
    return colorMap[color] || colorMap.yellow;
  };

  const riskColors = getRiskColorClasses(risk.color);

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">
        <AlertTriangle className="inline w-6 h-6 mr-2 text-orange-500" />
        Risk Analysis
      </h2>

      <div className={`p-6 rounded-lg border-2 ${riskColors.bg} ${riskColors.border}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Overall Risk Level</p>
            <p className={`text-3xl font-bold ${riskColors.text}`}>{risk.level}</p>
            <p className="text-sm text-gray-600 mt-1">{risk.description}</p>
          </div>
          <div className={`text-4xl font-bold ${riskColors.text}`}>{riskScore}/100</div>
        </div>
      </div>

      <div className="border border-gray-200 rounded-lg p-4">
        <div className="flex items-start gap-3">
          <Shield className={`w-6 h-6 flex-shrink-0 mt-1 ${insurance.warning ? 'text-red-500' : 'text-green-500'}`} />
          <div className="flex-1">
            <h3 className="font-semibold text-gray-800">Insurance Coverage Risk</h3>
            <p className="text-sm text-gray-600 mt-1">{insurance.coverage}</p>
            <p className={`text-sm font-medium mt-2 ${insurance.warning ? 'text-red-600' : 'text-green-600'}`}>
              {insurance.risk}
            </p>
            {insurance.warning && (
              <div className="mt-3 p-3 bg-red-50 rounded border border-red-200">
                <p className="text-sm text-red-800 font-medium">⚠️ Critical Risk</p>
                <p className="text-xs text-red-700 mt-1">
                  Claims may be denied during rideshare activities
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">Key Risk Factors</h3>
        
        {Object.entries(riskFactors).map(([key, factor]) => (
          <div key={key} className="border border-gray-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-gray-800">{factor.name}</h4>
                <p className="text-sm text-gray-600 mt-1">{factor.description}</p>
                <div className="mt-2 text-sm">
                  <p className="text-green-700">
                    <strong>Mitigation:</strong> {factor.mitigation}
                  </p>
                  <p className="text-orange-700 mt-1">
                    <strong>Cost:</strong> {factor.costImpact}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-gray-800 mb-2">
          {platform.name} Considerations
        </h3>
        <div className="space-y-2 text-sm">
          <p className="text-gray-700">
            <strong>Deactivation Risk:</strong> {platform.riskFactors.deactivationRisk.toUpperCase()}
          </p>
          <p className="text-gray-700">
            <strong>Background Checks:</strong> {platform.riskFactors.backgroundCheckFrequency}
          </p>
          <p className="text-gray-700">
            <strong>Vehicle Inspection:</strong> {platform.riskFactors.vehicleInspection}
          </p>
          {platform.riskFactors.physicalLabor && (
            <p className="text-orange-700 font-medium">⚠️ Physical labor required</p>
          )}
          {platform.riskFactors.weatherDependence && (
            <p className="text-orange-700 font-medium">⚠️ Weather-dependent income</p>
          )}
        </div>
      </div>

      {riskScore > 40 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
          <h3 className="font-semibold text-red-800 mb-2">⚠️ Immediate Actions</h3>
          <ul className="text-sm text-red-700 space-y-2 ml-4 list-disc">
            {insuranceKey === 'personal' && (
              <li><strong>URGENT:</strong> Upgrade insurance now</li>
            )}
            {inputs.vehicleAge > 8 && (
              <li>Budget for increased maintenance</li>
            )}
            {inputs.annualMiles > 25000 && (
              <li>Re-evaluate earnings vs depreciation</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
};

export default RiskAnalysis;
