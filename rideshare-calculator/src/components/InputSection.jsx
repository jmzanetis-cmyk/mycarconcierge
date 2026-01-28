import React, { useState } from 'react';
import { DollarSign, Fuel, Car, Clock, Percent, AlertTriangle, Shield } from 'lucide-react';
import { rideshareplatforms, insuranceTypes } from '../data/platforms';

const InputField = ({ label, icon: Icon, value, onChange, type = "number", step, placeholder, disabled = false, helpText }) => (
  <div>
    <label className="block text-sm font-medium text-gray-700 mb-2">
      {Icon && <Icon className="inline w-4 h-4 mr-1" />}
      {label}
    </label>
    <input
      type={type}
      step={step}
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
      className={`w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent ${disabled ? 'bg-gray-50' : ''}`}
    />
    {helpText && <p className="text-xs text-gray-500 mt-1">{helpText}</p>}
  </div>
);

const InfoCard = ({ title, notes, details, bgColor = "bg-blue-50", textColor = "text-blue-800" }) => (
  <div className={`mt-2 p-3 ${bgColor} rounded-md text-sm`}>
    <p className={`${textColor} font-medium`}>{title}</p>
    <p className={`${textColor.replace('800', '600')} text-xs mt-1`}>{notes}</p>
    {details && (
      <div className="mt-2 space-y-1 text-xs">
        {details.map((detail, idx) => (
          <p key={idx} className={textColor.replace('800', '700')}>• {detail}</p>
        ))}
      </div>
    )}
  </div>
);

const InputSection = ({ inputs, setInputs, onPlatformChange, onInsuranceChange }) => {
  const [selectedPlatform, setSelectedPlatform] = useState('uber');
  const [selectedInsurance, setSelectedInsurance] = useState('hybrid');
  const [showRiskWarning, setShowRiskWarning] = useState(false);

  const handleChange = (field) => (e) => {
    setInputs(prev => ({ ...prev, [field]: parseFloat(e.target.value) || 0 }));
  };

  const handlePlatformChange = (e) => {
    const platformKey = e.target.value;
    setSelectedPlatform(platformKey);
    const platform = rideshareplatforms[platformKey];
    
    setInputs(prev => ({
      ...prev,
      platformFeePercent: platform.commissionRate,
      platformName: platform.name
    }));
    
    onPlatformChange(platformKey);
  };

  const handleInsuranceChange = (e) => {
    const insuranceKey = e.target.value;
    setSelectedInsurance(insuranceKey);
    const insurance = insuranceTypes[insuranceKey];
    
    setInputs(prev => ({
      ...prev,
      monthlyInsuranceCost: insurance.monthlyCost,
      insuranceType: insuranceKey
    }));

    setShowRiskWarning(insurance.warning);
    onInsuranceChange(insuranceKey);
  };

  const currentPlatform = rideshareplatforms[selectedPlatform];
  const currentInsurance = insuranceTypes[selectedInsurance];

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Trip Calculator</h2>
      
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Car className="inline w-4 h-4 mr-1" />
          Select Platform
        </label>
        <select
          value={selectedPlatform}
          onChange={handlePlatformChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
        >
          <optgroup label="Rideshare">
            <option value="uber">Uber</option>
            <option value="lyft">Lyft</option>
            <option value="via">Via</option>
            <option value="alto">Alto (Employee)</option>
            <option value="wingz">Wingz (Airport)</option>
          </optgroup>
          <optgroup label="Delivery & Gig">
            <option value="uber_eats">Uber Eats</option>
            <option value="doordash">DoorDash</option>
            <option value="instacart">Instacart</option>
            <option value="goshare">GoShare</option>
            <option value="roadie">Roadie</option>
          </optgroup>
        </select>
        
        <InfoCard
          title={currentPlatform.name}
          notes={currentPlatform.notes}
          details={[
            `Commission: ${currentPlatform.commissionRate}%`,
            currentPlatform.vehicleRequirements && `Vehicle: ${currentPlatform.vehicleRequirements}`
          ].filter(Boolean)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          <Shield className="inline w-4 h-4 mr-1" />
          Insurance Coverage
        </label>
        <select
          value={selectedInsurance}
          onChange={handleInsuranceChange}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
        >
          {Object.entries(insuranceTypes).map(([key, ins]) => (
            <option key={key} value={key}>{ins.name} - ${ins.monthlyCost}/mo</option>
          ))}
        </select>

        {showRiskWarning && (
          <div className="mt-2 p-3 bg-red-50 border border-red-300 rounded-md">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-red-800">Insurance Warning!</p>
                <p className="text-red-700 mt-1">Personal insurance does NOT cover rideshare/delivery.</p>
              </div>
            </div>
          </div>
        )}

        <InfoCard
          title={currentInsurance.name}
          notes={currentInsurance.coverage}
          bgColor={showRiskWarning ? 'bg-red-50' : 'bg-green-50'}
          textColor={showRiskWarning ? 'text-red-800' : 'text-green-800'}
        />
      </div>

      <hr />

      <h3 className="text-xl font-semibold text-gray-800">Trip Details</h3>
      <div className="grid md:grid-cols-2 gap-4">
        <InputField label="Gross Fare ($)" icon={DollarSign} value={inputs.grossFare} onChange={handleChange('grossFare')} step="0.01" placeholder="25.00" />
        <InputField label="Miles Driven" icon={Car} value={inputs.miles} onChange={handleChange('miles')} step="0.1" placeholder="10.5" />
        <InputField label="Time (minutes)" icon={Clock} value={inputs.timeInMinutes} onChange={handleChange('timeInMinutes')} placeholder="30" />
        <InputField label="Platform Fee (%)" icon={Percent} value={inputs.platformFeePercent} onChange={() => {}} disabled helpText="Auto-filled from platform" />
      </div>

      <hr />

      <h3 className="text-xl font-semibold text-gray-800">Vehicle Information</h3>
      <div className="grid md:grid-cols-2 gap-4">
        <InputField label="Vehicle Value ($)" value={inputs.vehicleValue} onChange={handleChange('vehicleValue')} placeholder="25000" helpText="Current KBB value" />
        <InputField label="Vehicle Age (years)" value={inputs.vehicleAge} onChange={handleChange('vehicleAge')} placeholder="3" />
        <InputField label="Annual Miles" value={inputs.annualMiles} onChange={handleChange('annualMiles')} placeholder="15000" />
        <InputField label="Vehicle MPG" icon={Fuel} value={inputs.vehicleMPG} onChange={handleChange('vehicleMPG')} step="0.1" placeholder="30" />
        <InputField label="Gas Price ($/gal)" value={inputs.gasPricePerGallon} onChange={handleChange('gasPricePerGallon')} step="0.01" placeholder="3.50" />
        <InputField label="Monthly Insurance ($)" value={inputs.monthlyInsuranceCost} onChange={() => {}} disabled helpText="Auto-filled" />
      </div>
    </div>
  );
};

export default InputSection;
