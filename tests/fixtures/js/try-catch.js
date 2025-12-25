// @complexity tryCatch:cyclomatic=2,cognitive=1
function tryCatch() {
  try {
    doSomething();
  } catch (e) {
    handleError(e);
  }
}
