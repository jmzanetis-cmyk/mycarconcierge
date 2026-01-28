export const calculateDepreciation = (vehicleValue, annualMiles, vehicleAge) => {
  const firstYearRate = 0.20;
  const subsequentYearRate = 0.12;
  
  let currentValue = vehicleValue;
  
  if (vehicleAge === 0) {
    currentValue = vehicleValue * (1 - firstYearRate);
  } else {
    currentValue = vehicleValue * (1 - firstYearRate) * Math.pow((1 - subsequentYearRate), vehicleAge - 1);
  }
  
  const annualDepreciation = currentValue * subsequentYearRate;
  const perMileDepreciation = annualDepreciation / annualMiles;
  
  return {
    currentValue: currentValue,
    perMileDepreciation: perMileDepreciation,
    annualDepreciation: annualDepreciation
  };
};

export const calculateFuelCost = (gasPricePerGallon, vehicleMPG) => {
  return gasPricePerGallon / vehicleMPG;
};

export const estimateMaintenanceCost = (vehicleAge, annualMiles) => {
  let baseRate = 0.09;
  
  if (vehicleAge > 5) baseRate = 0.12;
  if (vehicleAge > 10) baseRate = 0.15;
  
  return baseRate;
};

export const calculateRideProfit = (params) => {
  const {
    grossFare,
    miles,
    platformFeePercent,
    depreciationPerMile,
    fuelCostPerMile,
    maintenancePerMile,
    timeInMinutes,
    includeInsurance = true,
    monthlyInsuranceCost = 150
  } = params;
  
  const platformFee = grossFare * (platformFeePercent / 100);
  const netFare = grossFare - platformFee;
  
  const depreciationCost = depreciationPerMile * miles;
  const fuelCost = fuelCostPerMile * miles;
  const maintenanceCost = maintenancePerMile * miles;
  
  const insuranceCostPerMinute = includeInsurance 
    ? (monthlyInsuranceCost / (40 * 4 * 60)) 
    : 0;
  const insuranceCost = insuranceCostPerMinute * timeInMinutes;
  
  const totalCosts = depreciationCost + fuelCost + maintenanceCost + insuranceCost;
  const profit = netFare - totalCosts;
  const profitMargin = (profit / grossFare) * 100;
  const hourlyRate = (profit / timeInMinutes) * 60;
  
  return {
    grossFare,
    platformFee,
    netFare,
    costs: {
      depreciation: depreciationCost,
      fuel: fuelCost,
      maintenance: maintenanceCost,
      insurance: insuranceCost,
      total: totalCosts
    },
    profit,
    profitMargin,
    hourlyRate
  };
};

export const calculateBreakEven = (params) => {
  const {
    miles,
    platformFeePercent,
    depreciationPerMile,
    fuelCostPerMile,
    maintenancePerMile
  } = params;
  
  const totalCostPerMile = depreciationPerMile + fuelCostPerMile + maintenancePerMile;
  const totalTripCost = totalCostPerMile * miles;
  const minimumFare = totalTripCost / (1 - (platformFeePercent / 100));
  
  return minimumFare;
};
