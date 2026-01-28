export const rideshareplatforms = {
  uber: {
    name: 'Uber',
    commissionRate: 25,
    bookingFee: 2.50,
    serviceFee: 0.55,
    minimumFare: 5.00,
    insuranceRequired: {
      liability: 1000000,
      collision: 'recommended',
      comprehensive: 'recommended'
    },
    riskFactors: {
      deactivationRisk: 'medium',
      backgroundCheckFrequency: 'annual',
      vehicleInspection: 'annual'
    },
    averageRidesPerHour: 2.5,
    notes: 'Most popular platform, highest volume'
  },
  lyft: {
    name: 'Lyft',
    commissionRate: 25,
    bookingFee: 2.50,
    serviceFee: 0.55,
    minimumFare: 5.00,
    insuranceRequired: {
      liability: 1000000,
      collision: 'recommended',
      comprehensive: 'recommended'
    },
    riskFactors: {
      deactivationRisk: 'medium',
      backgroundCheckFrequency: 'annual',
      vehicleInspection: 'annual'
    },
    averageRidesPerHour: 2.3,
    notes: 'Good alternative to Uber, similar rates'
  },
  via: {
    name: 'Via',
    commissionRate: 20,
    bookingFee: 0,
    serviceFee: 0,
    minimumFare: 4.00,
    insuranceRequired: {
      liability: 1000000,
      collision: 'required',
      comprehensive: 'required'
    },
    riskFactors: {
      deactivationRisk: 'low',
      backgroundCheckFrequency: 'annual',
      vehicleInspection: 'biannual'
    },
    averageRidesPerHour: 3.0,
    notes: 'Pooled rides, lower fares but higher volume'
  },
  alto: {
    name: 'Alto',
    commissionRate: 0,
    hourlyWage: 18.00,
    vehicleProvided: true,
    insuranceRequired: {
      liability: 'provided',
      collision: 'provided',
      comprehensive: 'provided'
    },
    riskFactors: {
      deactivationRisk: 'low',
      backgroundCheckFrequency: 'hire',
      vehicleInspection: 'monthly'
    },
    averageRidesPerHour: 2.0,
    notes: 'Employee model - company provides vehicle and insurance'
  },
  wingz: {
    name: 'Wingz',
    commissionRate: 15,
    bookingFee: 0,
    serviceFee: 0,
    minimumFare: 20.00,
    insuranceRequired: {
      liability: 1000000,
      collision: 'recommended',
      comprehensive: 'recommended'
    },
    riskFactors: {
      deactivationRisk: 'low',
      backgroundCheckFrequency: 'hire',
      vehicleInspection: 'annual'
    },
    averageRidesPerHour: 1.5,
    notes: 'Scheduled airport rides, pre-booked only'
  },
  goshare: {
    name: 'GoShare',
    commissionRate: 20,
    bookingFee: 0,
    serviceFee: 0,
    minimumFare: 30.00,
    insuranceRequired: {
      liability: 1000000,
      cargo: 100000,
      collision: 'required',
      comprehensive: 'required'
    },
    riskFactors: {
      physicalLabor: true,
      deactivationRisk: 'low',
      backgroundCheckFrequency: 'hire',
      vehicleInspection: 'annual'
    },
    vehicleRequirements: 'Pickup truck or cargo van',
    averageJobsPerHour: 1.0,
    notes: 'Delivery and moving service, requires larger vehicle'
  },
  roadie: {
    name: 'Roadie',
    commissionRate: 20,
    bookingFee: 0,
    serviceFee: 0,
    insuranceRequired: {
      liability: 1000000,
      cargo: 100000,
      collision: 'recommended',
      comprehensive: 'recommended'
    },
    riskFactors: {
      deactivationRisk: 'low',
      backgroundCheckFrequency: 'hire',
      vehicleInspection: 'none'
    },
    averageJobsPerHour: 0.8,
    notes: 'On-the-way delivery, flexible scheduling'
  },
  uber_eats: {
    name: 'Uber Eats',
    commissionRate: 30,
    bookingFee: 0,
    serviceFee: 0,
    minimumFare: 3.00,
    insuranceRequired: {
      liability: 'lower requirement',
      collision: 'optional',
      comprehensive: 'optional'
    },
    riskFactors: {
      deactivationRisk: 'medium',
      backgroundCheckFrequency: 'hire',
      vehicleInspection: 'none',
      weatherDependence: 'high'
    },
    averageDeliveriesPerHour: 3.0,
    notes: 'Food delivery, lower insurance requirements'
  },
  doordash: {
    name: 'DoorDash',
    commissionRate: 25,
    bookingFee: 0,
    serviceFee: 0,
    minimumFare: 2.50,
    insuranceRequired: {
      liability: 'lower requirement',
      collision: 'optional',
      comprehensive: 'optional'
    },
    riskFactors: {
      deactivationRisk: 'medium',
      backgroundCheckFrequency: 'hire',
      vehicleInspection: 'none',
      weatherDependence: 'high'
    },
    averageDeliveriesPerHour: 2.8,
    notes: 'Food delivery, peak pay bonuses available'
  },
  instacart: {
    name: 'Instacart',
    commissionRate: 0,
    batchPayment: true,
    averageBatchPay: 15.00,
    heavyOrderBonus: 10.00,
    insuranceRequired: {
      liability: 'standard auto',
      collision: 'optional',
      comprehensive: 'optional'
    },
    riskFactors: {
      physicalLabor: true,
      deactivationRisk: 'medium',
      backgroundCheckFrequency: 'hire',
      vehicleInspection: 'none'
    },
    averageBatchesPerHour: 1.5,
    notes: 'Grocery delivery, requires physical labor'
  }
};

export const insuranceTypes = {
  personal: {
    name: 'Personal Auto Insurance',
    monthlyCost: 150,
    coverage: 'Does NOT cover rideshare/delivery',
    risk: 'HIGH - Claims may be denied',
    warning: true
  },
  rideshare_addon: {
    name: 'Rideshare Endorsement',
    monthlyCost: 180,
    coverage: 'Covers app-on, waiting for ride',
    risk: 'LOW - Recommended minimum',
    warning: false
  },
  hybrid: {
    name: 'Hybrid Policy (Personal + Rideshare)',
    monthlyCost: 180,
    coverage: 'Personal + Period 1 rideshare coverage',
    risk: 'LOW - Industry standard',
    warning: false
  },
  commercial: {
    name: 'Commercial Auto Insurance',
    monthlyCost: 400,
    coverage: 'Full coverage for all business use',
    risk: 'NONE - Complete protection',
    warning: false
  }
};

export const riskFactors = {
  accident: {
    name: 'Accident Risk',
    description: 'Higher mileage = higher accident probability',
    mitigation: 'Defensive driving, dash cam, regular maintenance',
    costImpact: 'Variable - $500-$5000+ per incident'
  },
  deactivation: {
    name: 'Account Deactivation',
    description: 'Low ratings, complaints, or policy violations',
    mitigation: 'Maintain >4.7 rating, professional service',
    costImpact: 'Loss of income until reactivated'
  },
  wear_and_tear: {
    name: 'Accelerated Vehicle Wear',
    description: 'High mileage leads to faster deterioration',
    mitigation: 'Regular maintenance, quality parts',
    costImpact: 'Calculated in maintenance costs'
  },
  insurance_claim_denial: {
    name: 'Insurance Claim Denial',
    description: 'Using personal policy for rideshare',
    mitigation: 'Get proper rideshare coverage',
    costImpact: 'Could be total loss ($10k-$50k+)'
  },
  tax_liability: {
    name: 'Tax Obligations',
    description: '1099 contractor - quarterly taxes',
    mitigation: 'Set aside 25-30% for taxes',
    costImpact: '25-30% of net profit'
  },
  market_saturation: {
    name: 'Market Oversaturation',
    description: 'Too many drivers = lower earnings',
    mitigation: 'Drive peak hours, multi-app',
    costImpact: 'Variable - reduced frequency'
  }
};

export const platformAlternatives = {
  turo: {
    name: 'Turo',
    type: 'Car Rental',
    earningPotential: '$500-$1,500+/month per vehicle',
    bestFor: 'Newer vehicles, part-time income',
    pros: ['Passive income - no driving required', 'Set your own prices and availability'],
    cons: ['Requires newer, desirable vehicles', 'Risk of damage by renters'],
    insuranceNote: 'Turo provides coverage during rentals, but check your personal policy'
  },
  hyrecar: {
    name: 'HyreCar',
    type: 'Vehicle Rental to Drivers',
    earningPotential: '$200-$400/week per vehicle',
    bestFor: 'Extra vehicles, steady income',
    pros: ['Steady weekly income', 'Drivers are verified and insured'],
    cons: ['Higher mileage on your vehicle', 'Vehicle must meet rideshare requirements'],
    insuranceNote: 'Commercial rental insurance required'
  },
  amazon_flex: {
    name: 'Amazon Flex',
    type: 'Package Delivery',
    earningPotential: '$18-$25/hour (before expenses)',
    bestFor: 'Predictable hours, any vehicle',
    pros: ['Scheduled blocks = predictable income', 'No passengers, just packages'],
    cons: ['Physical work (lifting packages)', 'Blocks can be competitive to get'],
    insuranceNote: 'Commercial use endorsement recommended'
  },
  goshare_dolly: {
    name: 'GoShare / Dolly',
    type: 'Moving & Delivery',
    earningPotential: '$30-$60/hour',
    bestFor: 'Trucks, vans, SUVs',
    pros: ['Higher hourly rates than rideshare', 'Less competition than Uber/Lyft'],
    cons: ['Requires truck/van/large SUV', 'Heavy lifting required'],
    insuranceNote: 'Commercial auto with cargo coverage recommended'
  },
  getaround: {
    name: 'Getaround',
    type: 'Hourly Car Rental',
    earningPotential: '$300-$800/month',
    bestFor: 'Urban areas, hourly rentals',
    pros: ['More transactions with hourly rentals', 'Keyless access technology'],
    cons: ['Limited to certain markets', 'Lower per-rental income'],
    insuranceNote: 'Check if your personal policy allows car sharing'
  }
};
