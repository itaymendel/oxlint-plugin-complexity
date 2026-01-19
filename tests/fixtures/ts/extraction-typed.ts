// @complexity analyzeData:cyclomatic=11,cognitive=29
// TypeScript function with type annotations to test type preservation in suggestions
interface DataItem {
  id: string;
  value: number;
  active: boolean;
  children?: DataItem[];
}

interface Config {
  threshold: number;
  recursive: boolean;
  logger?: (msg: string) => void;
}

function analyzeData(items: DataItem[], config: Config): number[] {
  const results: number[] = [];
  let accumulated = 0;

  // Extractable block with typed inputs/outputs
  for (const item of items) {  // +1
    if (item.active) {  // +2 (nesting=1)
      if (item.value > config.threshold) {  // +3 (nesting=2)
        results.push(item.value);

        if (config.recursive && item.children) {  // +4 (nesting=3)
          for (const child of item.children) {  // +5 (nesting=4)
            if (child.active) {  // +6 (nesting=5)
              results.push(child.value);
            }
          }
        }
      }
    }
  }

  // Block with closure over mutable state (problematic)
  const processor = (val: number) => {
    if (val > 0) {  // +1
      accumulated += val;  // Closure over mutable
    }
  };

  for (const result of results) {  // +1
    if (result > config.threshold) {  // +2 (nesting=1)
      processor(result);
      if (config.logger) {  // +3 (nesting=2)
        config.logger(`Processed: ${result}`);
      }
    }
  }

  return results;
}
