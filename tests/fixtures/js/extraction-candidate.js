// @complexity processOrder:cyclomatic=11,cognitive=20
// A complex function that has clear extraction opportunities
function processOrder(order, config) {
  let totalCount = 0;
  let processedItems = [];

  // Block 1: Extractable - validate and transform items (lines 9-20)
  // Inputs: order, config | Outputs: processedItems
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

  // Block 2: Requires refactoring - mutates external totalCount (lines 24-32)
  for (const processed of processedItems) {  // +1
    if (processed.price > 100) {  // +2 (nesting=1)
      totalCount++;  // Mutation!
      if (config.premium) {  // +3 (nesting=2)
        processed.discount = 0.1;
        totalCount++;  // Another mutation!
      }
    }
  }

  // Block 3: Simple extractable block (lines 35-40)
  if (config.logging) {  // +1
    for (const item of processedItems) {  // +2 (nesting=1)
      console.log(item);
    }
  }

  return { items: processedItems, count: totalCount };
}
