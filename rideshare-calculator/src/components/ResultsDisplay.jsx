import React from 'react';
import { TrendingUp, TrendingDown, DollarSign, AlertCircle } from 'lucide-react';

const ResultsDisplay = ({ results, breakEven }) => {
  const isProfitable = results.profit > 0;
  
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Profit Analysis</h2>
      
      <div className={`p-6 rounded-lg ${isProfitable ? 'bg-green-50 border-2 border-green-500' : 'bg-red-50 border-2 border-red-500'}`}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Net Profit</p>
            <p className={`text-4xl font-bold ${isProfitable ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(results.profit)}
            </p>
            <p className="text-sm text-gray-600 mt-1">
              Margin: {results.profitMargin.toFixed(1)}%
            </p>
          </div>
          {isProfitable ? (
            <TrendingUp className="w-16 h-16 text-green-600" />
          ) : (
            <TrendingDown className="w-16 h-16 text-red-600" />
          )}
        </div>
      </div>

      <div className="bg-blue-50 p-4 rounded-lg">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-600">Effective Hourly Rate</p>
            <p className="text-2xl font-bold text-blue-600">
              {formatCurrency(results.hourlyRate)}/hr
            </p>
          </div>
          <DollarSign className="w-12 h-12 text-blue-600" />
        </div>
      </div>

      <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-300">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-1" />
          <div>
            <p className="font-semibold text-gray-800">Break-Even Fare</p>
            <p className="text-lg font-bold text-yellow-700">{formatCurrency(breakEven)}</p>
            <p className="text-sm text-gray-600 mt-1">
              {results.grossFare >= breakEven 
                ? '✓ This ride meets break-even'
                : '✗ This ride is below break-even'
              }
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-lg font-semibold text-gray-800">Cost Breakdown</h3>
        
        <div className="space-y-2">
          <div className="flex justify-between p-3 bg-gray-50 rounded">
            <span className="text-gray-700">Gross Fare</span>
            <span className="font-semibold">{formatCurrency(results.grossFare)}</span>
          </div>
          
          <div className="flex justify-between p-3 bg-gray-50 rounded">
            <span className="text-gray-700">Platform Fee</span>
            <span className="font-semibold text-red-600">-{formatCurrency(results.platformFee)}</span>
          </div>
          
          <div className="flex justify-between p-3 bg-blue-50 rounded font-medium">
            <span className="text-gray-700">Net Fare</span>
            <span>{formatCurrency(results.netFare)}</span>
          </div>

          <hr className="my-2" />

          <div className="flex justify-between p-3 bg-gray-50 rounded">
            <span className="text-gray-700">Fuel Cost</span>
            <span className="font-semibold text-red-600">-{formatCurrency(results.costs.fuel)}</span>
          </div>

          <div className="flex justify-between p-3 bg-gray-50 rounded">
            <span className="text-gray-700">Depreciation</span>
            <span className="font-semibold text-red-600">-{formatCurrency(results.costs.depreciation)}</span>
          </div>

          <div className="flex justify-between p-3 bg-gray-50 rounded">
            <span className="text-gray-700">Maintenance</span>
            <span className="font-semibold text-red-600">-{formatCurrency(results.costs.maintenance)}</span>
          </div>

          <div className="flex justify-between p-3 bg-gray-50 rounded">
            <span className="text-gray-700">Insurance</span>
            <span className="font-semibold text-red-600">-{formatCurrency(results.costs.insurance)}</span>
          </div>

          <div className="flex justify-between p-3 bg-gray-50 rounded font-medium">
            <span className="text-gray-700">Total Costs</span>
            <span className="text-red-600">-{formatCurrency(results.costs.total)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsDisplay;
