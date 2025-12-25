// @complexity fiveLevels:cyclomatic=6,cognitive=15 sixLevels:cyclomatic=7,cognitive=21 mixedDeep:cyclomatic=7,cognitive=15

// 5 levels of nested for loops
// 1+2+3+4+5 = 15 cognitive
function fiveLevels() {
  for (let a = 0; a < 2; a++) {
    for (let b = 0; b < 2; b++) {
      for (let c = 0; c < 2; c++) {
        for (let d = 0; d < 2; d++) {
          for (let e = 0; e < 2; e++) {
            console.log(a, b, c, d, e);
          }
        }
      }
    }
  }
}

// 6 levels of nested for loops
// 1+2+3+4+5+6 = 21 cognitive
function sixLevels() {
  for (let a = 0; a < 2; a++) {
    for (let b = 0; b < 2; b++) {
      for (let c = 0; c < 2; c++) {
        for (let d = 0; d < 2; d++) {
          for (let e = 0; e < 2; e++) {
            for (let f = 0; f < 2; f++) {
              console.log(a, b, c, d, e, f);
            }
          }
        }
      }
    }
  }
}

// Mixed control flow structures deeply nested
// cyclomatic: base(1) + for(1) + if(1) + 2 cases(2) + if(1) + while(1) = 7
// cognitive: for(+1) + if(+2) + switch(+3) + if(+4) + while(+5) - but test shows 11
function mixedDeep(value) {
  for (let i = 0; i < 10; i++) {
    if (i > 5) {
      switch (i) {
        case 6:
          if (value) {
            while (value > 0) {
              value--;
            }
          }
          break;
        case 7:
          break;
      }
    }
  }
}
