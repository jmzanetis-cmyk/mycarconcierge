import React, { useState, useEffect } from 'react';
import InputSection from './InputSection';
import ResultsDisplay from './ResultsDisplay';
import RiskAnalysis from './RiskAnalysis';
import NextSteps from './NextSteps';
import {
  calculateDepreciation,
  calculateFuelCost,
  estimateMaintenanceCost,
  calculateRideProfit,
  calculateBreakEven
} from '../utils/calculations';
import { rideshareplatforms } from '../data/platforms';

const Calculator = () => {
  const [inputs, setInputs] = useState({
    grossFare: 25,
    miles: 10,
    timeInMinutes: 30,
    platformFeePercent: 25,
    platformName: 'Uber',
    vehicleValue: 25000,
    vehicleAge: 3,
    annualMiles: 15000,
    vehicleMPG: 30,
    gasPricePerGallon: 3.50,
    monthlyInsuranceCost: 180,
    insuranceType: 'hybrid'
  });

  const [platformKey, setPlatformKey] = useState('uber');
  const [insuranceKey, setInsuranceKey] = useState('hybrid');
  const [results, setResults] = useState(null);
  const [breakEven, setBreakEven] = useState(0);

  const calculateRiskScore = () => {
    let score = 0;
    if (insuranceKey === 'personal') score += 40;
    else if (insuranceKey === 'rideshare_addon') score += 20;
    else if (insuranceKey === 'hybrid') score += 10;
    
    const platform = rideshareplatforms[platformKey];
    if (platform?.riskFactors.deactivationRisk === 'high') score += 20;
    else if (platform?.riskFactors.deactivationRisk === 'medium') score += 10;
    
    if (inputs.vehicleAge > 10) score += 20;
    else if (inputs.vehicleAge > 5) score += 10;
    
    if (inputs.annualMiles > 30000) score += 20;
    else if (inputs.annualMiles > 20000) score += 10;
    
    return score;
  };

  useEffect(() => {
    const depreciation = calculateDepreciation(
      inputs.vehicleValue,
      inputs.annualMiles,
      inputs.vehicleAge
    );
    
    const fuelCostPerMile = calculateFuelCost(
      inputs.gasPricePerGallon,
      inputs.vehicleMPG
    );
    
    const maintenancePerMile = estimateMaintenanceCost(
      inputs.vehicleAge,
      inputs.annualMiles
    );

    const profitResults = calculateRideProfit({
      grossFare: inputs.grossFare,
      miles: inputs.miles,
      platformFeePercent: inputs.platformFeePercent,
      depreciationPerMile: depreciation.perMileDepreciation,
      fuelCostPerMile: fuelCostPerMile,
      maintenancePerMile: maintenancePerMile,
      timeInMinutes: inputs.timeInMinutes,
      monthlyInsuranceCost: inputs.monthlyInsuranceCost
    });

    const breakEvenFare = calculateBreakEven({
      miles: inputs.miles,
      platformFeePercent: inputs.platformFeePercent,
      depreciationPerMile: depreciation.perMileDepreciation,
      fuelCostPerMile: fuelCostPerMile,
      maintenancePerMile: maintenancePerMile
    });

    setResults(profitResults);
    setBreakEven(breakEvenFare);
  }, [inputs]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Rideshare & Gig Profit Calculator
          </h1>
          <p className="text-lg text-gray-600">
            Discover your true earnings after ALL costs & risks
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Powered by My Car Concierge
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mb-6">
          <InputSection 
            inputs={inputs} 
            setInputs={setInputs}
            onPlatformChange={setPlatformKey}
            onInsuranceChange={setInsuranceKey}
          />
          {results && <ResultsDisplay results={results} breakEven={breakEven} />}
        </div>

        <div className="mb-6">
          <RiskAnalysis 
            inputs={inputs}
            platformKey={platformKey}
            insuranceKey={insuranceKey}
          />
        </div>

        {results && (
          <div className="mb-6">
            <NextSteps 
              results={results}
              riskScore={calculateRiskScore()}
              insuranceKey={insuranceKey}
              inputs={inputs}
            />
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">
            Why Most Drivers Lose Money
          </h3>
          <div className="grid md:grid-cols-4 gap-4 text-sm text-gray-600">
            <div>
              <p className="font-medium text-gray-800 mb-1">Hidden Depreciation</p>
              <p>$0.15-0.40 per mile in lost value</p>
            </div>
            <div>
              <p className="font-medium text-gray-800 mb-1">Insurance Gap</p>
              <p>One denied claim = $20k+ loss</p>
            </div>
            <div>
              <p className="font-medium text-gray-800 mb-1">Real Hourly Rate</p>
              <p>Often $8-12/hr after costs</p>
            </div>
            <div>
              <p className="font-medium text-gray-800 mb-1">Solution</p>
              <p className="font-semibold text-blue-600">Lower maintenance with My Car Concierge</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Calculator;
