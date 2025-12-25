// @complexity labeledBreak:cyclomatic=2,cognitive=2 labeledContinue:cyclomatic=2,cognitive=2 multipleLabeledJumps:cyclomatic=5,cognitive=11 nestedLabeledBreak:cyclomatic=4,cognitive=7

// Labeled break: for(+1) + break to label(+1) = 2 cognitive
function labeledBreak() {
  outer: for (let i = 0; i < 10; i++) {
    break outer;
  }
}

// Labeled continue: for(+1) + continue to label(+1) = 2 cognitive
function labeledContinue() {
  outer: for (let i = 0; i < 10; i++) {
    continue outer;
  }
}

// Multiple labeled jumps with deep nesting
// for(+1) + for(+2) + if(+3) + break outer(+1) + if(+3) + continue inner(+1) = 11 cognitive
function multipleLabeledJumps() {
  outer: for (let i = 0; i < 10; i++) {
    inner: for (let j = 0; j < 10; j++) {
      if (j === 5) {
        break outer;
      }
      if (i === 5) {
        continue inner;
      }
    }
  }
}

// Nested labeled break: for(+1) + while(+2) + if(+3) + break outer(+1) = 5 cognitive
// cyclomatic: base(1) + for(1) + while(1) + if(1) = 4
function nestedLabeledBreak() {
  outer: for (let i = 0; i < 10; i++) {
    while (i < 5) {
      if (i === 3) {
        break outer;
      }
      i++;
    }
  }
}
