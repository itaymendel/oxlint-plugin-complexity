// @complexity basicFallthrough:cyclomatic=4,cognitive=1 partialFallthrough:cyclomatic=4,cognitive=1 nestedInCase:cyclomatic=4,cognitive=3 fallthroughWithLogic:cyclomatic=5,cognitive=5

// Basic fallthrough: cases 1 and 2 share the same code
// switch(+1 cognitive) + 3 cases(cyclomatic only)
function basicFallthrough(value) {
  switch (value) {
    case 1:
    case 2:
      return 'one or two';
    case 3:
      return 'three';
    default:
      return 'other';
  }
}

// Partial fallthrough: case 1 falls through to case 2
// switch adds +0 cognitive here because... testing shows 0
function partialFallthrough(value) {
  let result = '';
  switch (value) {
    case 1:
      result += 'one';
    // fallthrough
    case 2:
      result += 'two';
      break;
    case 3:
      result = 'three';
      break;
    default:
      result = 'other';
  }
  return result;
}

// Nested control flow inside a case
// switch(+1) + if(+2) = 3 cognitive
function nestedInCase(value, flag) {
  switch (value) {
    case 1:
      if (flag) {
        return 'one with flag';
      }
      return 'one';
    case 2:
      return 'two';
    default:
      return 'other';
  }
}

// Fallthrough with additional logic
// switch(+1) + if(+2) + if(+2) = 5 cognitive
function fallthroughWithLogic(value, extra) {
  switch (value) {
    case 1:
      if (extra) {
        console.log('extra for one');
      }
    // fallthrough
    case 2:
      if (value === 1) {
        return 'was one';
      }
      return 'two';
    default:
      return 'other';
  }
}
