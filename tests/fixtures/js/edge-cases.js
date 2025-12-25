// @complexity anonymous_1:cyclomatic=2,cognitive=1 count:cyclomatic=2,cognitive=1 name:cyclomatic=2,cognitive=2 assignedFunc:cyclomatic=2,cognitive=1

// IIFE - should be analyzed
(function () {
  if (true) {
    console.log('iife');
  }
})();

// Object with getter/setter (different names to test both)
const obj = {
  _count: 0,
  _name: '',

  get count() {
    if (this._count < 0) {
      return 0;
    }
    return this._count;
  },

  set name(v) {
    if (!v) {
      this._name = 'default';
    } else {
      this._name = v;
    }
  },
};

// Assignment expression naming
let assignedFunc;
assignedFunc = function (x) {
  if (x) {
    return x;
  }
  return null;
};
