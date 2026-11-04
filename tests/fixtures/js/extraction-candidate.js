// @complexity processOrder:cyclomatic=11,cognitive=20 describeOrder:cyclomatic=5,cognitive=6
// A complex function that has clear extraction opportunities
function processOrder(order, config) {
  let totalCount = 0;
  let processedItems = [];

  // Block 1: Needs refactoring - the validation guard (lines 11-15) contains `continue`,
  // which targets the loop outside the block (medium confidence, no signature)
  for (const item of order.items) {  // +1
    if (item.active) {  // +2 (nesting=1)
      if (config.validate) {  // +3 (nesting=2)
        if (!item.price || item.price < 0) {  // +4 (nesting=3)
          continue;
        }
      }
      const transformed = {
        id: item.id,
        price: item.price * config.multiplier
      };
      processedItems.push(transformed);
    }
  }

  // Block 2: Requires refactoring - mutates external totalCount (lines 25-33)
  for (const processed of processedItems) {  // +1
    if (processed.price > 100) {  // +2 (nesting=1)
      totalCount++;  // Mutation!
      if (config.premium) {  // +3 (nesting=2)
        processed.discount = 0.1;
        totalCount++;  // Another mutation!
      }
    }
  }

  // Block 3: Simple block (lines 36-40), below the extraction threshold
  if (config.logging) {  // +1
    for (const item of processedItems) {  // +2 (nesting=1)
      console.log(item);
    }
  }

  return { items: processedItems, count: totalCount };
}

// Two pure computations, each with a clean signature (high confidence)
function describeOrder(order, config) {
  // Block 1: Inputs: order | Outputs: label
  const label = order.express
    ? order.vip
      ? 'priority'
      : 'express'
    : 'standard';

  // Block 2: Inputs: order, config | Outputs: fee
  const fee = order.express
    ? order.vip
      ? config.vipFee
      : config.expressFee
    : config.baseFee;

  return label + ':' + fee;
}
