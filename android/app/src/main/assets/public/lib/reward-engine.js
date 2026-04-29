const RewardEngine = {
  evaluate(templateSlug, balance, parameters) {
    const evaluator = this.evaluators[templateSlug];
    if (!evaluator) {
      return {
        progress: 0,
        threshold: 0,
        percentage: 0,
        isEarned: false,
        label: 'Evaluator not implemented',
        remaining: 0,
        nearMilestone: false
      };
    }
    return evaluator(balance, parameters);
  },

  evaluators: {
    punch_card(balance, params) {
      const current = balance.punch_count || 0;
      const needed = parseInt(params.punches_required) || 1;
      return {
        progress: current,
        threshold: needed,
        percentage: Math.min(100, Math.round((current / needed) * 100)),
        isEarned: current >= needed,
        label: `${current} / ${needed} punches`,
        remaining: Math.max(0, needed - current),
        nearMilestone: (needed - current <= 1) && current > 0
      };
    },

    spend_discount(balance, params) {
      return {
        progress: 0,
        threshold: 0,
        percentage: 0,
        isEarned: false,
        label: 'spend_discount evaluator not yet implemented',
        remaining: 0,
        nearMilestone: false
      };
    },

    visit_milestone(balance, params) {
      return {
        progress: 0,
        threshold: 0,
        percentage: 0,
        isEarned: false,
        label: 'visit_milestone evaluator not yet implemented',
        remaining: 0,
        nearMilestone: false
      };
    }
  },

  isQualifyingService(serviceType, parameters) {
    if (!parameters.qualifying_services || parameters.qualifying_services.length === 0) {
      return true;
    }
    return parameters.qualifying_services.includes(serviceType);
  },

  calculateRewardValue(templateSlug, parameters, jobAmount) {
    if (templateSlug === 'spend_discount') {
      if (parameters.discount_type === 'percentage') {
        const discount = jobAmount * (parameters.discount_value / 100);
        return parameters.max_discount ? Math.min(discount, parameters.max_discount) : discount;
      }
      return parameters.discount_value;
    }
    return parameters.reward_value || 0;
  }
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = RewardEngine;
}

if (typeof window !== 'undefined') {
  window.RewardEngine = RewardEngine;
}
