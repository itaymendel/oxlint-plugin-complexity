// @complexity unlabeledBreak:cyclomatic=3,cognitive=3 unlabeledContinue:cyclomatic=3,cognitive=3 breakInSwitch:cyclomatic=3,cognitive=1 breakInWhile:cyclomatic=3,cognitive=3 mixedBreakContinue:cyclomatic=4,cognitive=5

// Unlabeled break inside loop - NO complexity added for break itself
// for(+1) + if(+2 nested) = 3 cognitive
function unlabeledBreak() {
  for (let i = 0; i < 10; i++) {
    if (i === 5) {
      break;
    }
  }
}

// Unlabeled continue inside loop - NO complexity added
// for(+1) + if(+2 nested) = 3 cognitive
function unlabeledContinue() {
  for (let i = 0; i < 10; i++) {
    if (i === 5) {
      continue;
    }
    console.log(i);
  }
}

// Break in switch - standard pattern, no complexity for break
// switch(+1) + case1 + case2 (cyclomatic only) = 1 cognitive
function breakInSwitch(value) {
  switch (value) {
    case 1:
      doOne();
      break;
    case 2:
      doTwo();
      break;
    default:
      doDefault();
  }
}

// Break in while loop
// while(+1) + if(+2 nested) = 3 cognitive
function breakInWhile(items) {
  let i = 0;
  while (i < items.length) {
    if (items[i] === null) {
      break;
    }
    i++;
  }
}

// Mixed break and continue
// for(+1) + if(+2) + if(+2) = 5 cognitive
function mixedBreakContinue(items) {
  for (const item of items) {
    if (item === null) {
      continue;
    }
    if (item === 'stop') {
      break;
    }
    process(item);
  }
}
