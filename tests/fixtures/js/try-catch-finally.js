// @complexity tryCatchOnly:cyclomatic=2,cognitive=1 tryFinallyOnly:cyclomatic=1,cognitive=0 tryCatchFinally:cyclomatic=2,cognitive=1 nestedTryCatch:cyclomatic=3,cognitive=2 catchWithCondition:cyclomatic=3,cognitive=3

// Basic try-catch: catch adds +1 cognitive and +1 cyclomatic
function tryCatchOnly() {
  try {
    doSomething();
  } catch (e) {
    handleError(e);
  }
}

// Try-finally without catch: finally adds no complexity
function tryFinallyOnly() {
  try {
    doSomething();
  } finally {
    cleanup();
  }
}

// Try-catch-finally: only catch adds complexity
function tryCatchFinally() {
  try {
    doSomething();
  } catch (e) {
    handleError(e);
  } finally {
    cleanup();
  }
}

// Nested try-catch blocks
function nestedTryCatch() {
  try {
    try {
      doSomething();
    } catch (inner) {
      handleInner(inner);
    }
  } catch (outer) {
    handleOuter(outer);
  }
}

// Catch with conditional logic inside
// catch(+1) + if(+2 nested inside catch body) = 3 cognitive
function catchWithCondition() {
  try {
    doSomething();
  } catch (e) {
    if (e instanceof TypeError) {
      handleTypeError(e);
    }
  }
}
