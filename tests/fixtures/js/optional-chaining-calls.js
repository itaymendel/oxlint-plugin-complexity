// @complexity optionalCall:cyclomatic=2,cognitive=0 chainedOptional:cyclomatic=4,cognitive=0 mixedChain:cyclomatic=3,cognitive=0 optionalInCondition:cyclomatic=4,cognitive=1 parenthesizedChain:cyclomatic=2,cognitive=0
function optionalCall(fn) {
  // ?.() is +1
  return fn?.();
}

function chainedOptional(o) {
  // o?.method (+1), ?.() (+1), ?.value (+1)
  return o?.method?.()?.value;
}

function mixedChain(a) {
  // a?.b (+1), .c (+0), ?.[0] (+1)
  return a?.b.c?.[0];
}

function optionalInCondition(u) {
  // if (+1), u?.profile (+1), ?.name (+1)
  if (u?.profile?.name) {
    return u.profile.name;
  }
  return null;
}

function parenthesizedChain(a) {
  // (a?.b) is +1, .c outside the chain is +0
  return (a?.b).c;
}
