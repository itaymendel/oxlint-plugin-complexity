// @complexity posReturn:cyclomatic=2,cognitive=0 posCallArg:cyclomatic=2,cognitive=0 posObjectProp:cyclomatic=2,cognitive=0 posArrayElement:cyclomatic=2,cognitive=0 posSpread:cyclomatic=2,cognitive=0 posArrowBody:cyclomatic=1,cognitive=0 posTemplate:cyclomatic=2,cognitive=0 posOtherAssign:cyclomatic=2,cognitive=0 posSelfAssign:cyclomatic=2,cognitive=0 posForOf:cyclomatic=3,cognitive=1 posIfCondition:cyclomatic=3,cognitive=1 posTernaryTest:cyclomatic=3,cognitive=1 posDeclarator:cyclomatic=2,cognitive=0 shapeNumber:cyclomatic=2,cognitive=0 shapeNegative:cyclomatic=2,cognitive=0 shapePositive:cyclomatic=2,cognitive=0 shapeNegBigInt:cyclomatic=2,cognitive=0 shapeUndefined:cyclomatic=2,cognitive=0 shapeTemplateEmpty:cyclomatic=2,cognitive=0 shapeArray:cyclomatic=2,cognitive=0 shapeObject:cyclomatic=2,cognitive=0 shapeAsConst:cyclomatic=2,cognitive=0 shapeSatisfies:cyclomatic=2,cognitive=0 shapeNonNull:cyclomatic=2,cognitive=0 shapeAngle:cyclomatic=2,cognitive=0 shapeParenLiteral:cyclomatic=2,cognitive=0 shapeNoopArrow:cyclomatic=2,cognitive=0 shapeNoopFunction:cyclomatic=2,cognitive=0 shapeNoopParam:cyclomatic=2,cognitive=0 shapeNoopFnParam:cyclomatic=2,cognitive=0 shapeNoopRest:cyclomatic=2,cognitive=0 shapeNoopComment:cyclomatic=2,cognitive=0 shapeOrOperator:cyclomatic=2,cognitive=0 shapeWholeAs:cyclomatic=2,cognitive=0 shapeWholeSatisfies:cyclomatic=2,cognitive=0 shapeWholeAngle:cyclomatic=2,cognitive=0 shapeWholeNonNull:cyclomatic=2,cognitive=0 shapeChainNested:cyclomatic=3,cognitive=0 shapeChainLong:cyclomatic=4,cognitive=0 shapeChainMixed:cyclomatic=3,cognitive=1 shapeWholeChainBool:cyclomatic=3,cognitive=0 shapeNonEmptyArray:cyclomatic=2,cognitive=1 shapeRegex:cyclomatic=2,cognitive=0 contParenOr:cyclomatic=3,cognitive=1 contParenLeft:cyclomatic=3,cognitive=1 contParenAnd:cyclomatic=3,cognitive=1 mixedParenInner:cyclomatic=3,cognitive=0 negIdent:cyclomatic=2,cognitive=1 negCall:cyclomatic=2,cognitive=1 negBools:cyclomatic=2,cognitive=1 negChainNoConst:cyclomatic=3,cognitive=1 negAndConst:cyclomatic=2,cognitive=1 negMixedAnd:cyclomatic=3,cognitive=1 negMixedAnd2:cyclomatic=3,cognitive=1 negAndInOr:cyclomatic=3,cognitive=2 negNaN:cyclomatic=2,cognitive=1 negInfinity:cyclomatic=2,cognitive=1 negNumberConst:cyclomatic=2,cognitive=1 negTemplateExpr:cyclomatic=2,cognitive=1 negTaggedTemplate:cyclomatic=2,cognitive=1 negNot:cyclomatic=2,cognitive=1 negVoid:cyclomatic=2,cognitive=1 negUnaryIdent:cyclomatic=2,cognitive=1 negUnaryParen:cyclomatic=2,cognitive=1 negArrowExprBody:cyclomatic=2,cognitive=1 negArrowParamDefault:cyclomatic=2,cognitive=1 negArrowDestructure:cyclomatic=2,cognitive=1 negArrowStmt:cyclomatic=2,cognitive=1 negAsyncNoop:cyclomatic=2,cognitive=1 negGeneratorNoop:cyclomatic=2,cognitive=1 negCallArg:cyclomatic=2,cognitive=1 knownTsWrappedChain:cyclomatic=3,cognitive=1 posParamDefault:cyclomatic=3,cognitive=0 shapeRepro173:cyclomatic=12,cognitive=0 shapeRepro174:cyclomatic=6,cognitive=0 buildState:cyclomatic=45,cognitive=2 getter:cyclomatic=2,cognitive=0 shapeConstArray:cyclomatic=2,cognitive=0 shapeConstObject:cyclomatic=2,cognitive=0 shapeArrayHole:cyclomatic=2,cognitive=0 shapeObjectEmptyNested:cyclomatic=2,cognitive=0 negArrayCall:cyclomatic=2,cognitive=1 negArraySpread:cyclomatic=2,cognitive=1 negObjectCall:cyclomatic=2,cognitive=1 negObjectIdent:cyclomatic=2,cognitive=1 negObjectSpread:cyclomatic=2,cognitive=1 negObjectComputed:cyclomatic=2,cognitive=1 negObjectMethod:cyclomatic=2,cognitive=1 negObjectGetter:cyclomatic=2,cognitive=1 negNestedCall:cyclomatic=2,cognitive=1 condIf:cyclomatic=4,cognitive=2 condIfNullish:cyclomatic=4,cognitive=2 condWhile:cyclomatic=4,cognitive=2 condWhileSingle:cyclomatic=3,cognitive=1 condDoWhile:cyclomatic=4,cognitive=2 condFor:cyclomatic=4,cognitive=2 condTernary:cyclomatic=4,cognitive=2 condNot:cyclomatic=4,cognitive=2 condAs:cyclomatic=4,cognitive=2 condNested:cyclomatic=5,cognitive=3 condNestedOr:cyclomatic=5,cognitive=2 condNestedSingle:cyclomatic=4,cognitive=2 condRightNested:cyclomatic=4,cognitive=2 nonCondChain:cyclomatic=3,cognitive=0 nonCondAssign:cyclomatic=3,cognitive=0 nonCondTernaryBranch:cyclomatic=4,cognitive=1 negObjectGetterEmpty:cyclomatic=2,cognitive=1 condSatisfies:cyclomatic=4,cognitive=2 condNonNull:cyclomatic=4,cognitive=2 condAngle:cyclomatic=4,cognitive=2 condUnaryMinus:cyclomatic=4,cognitive=1 condAndInChain:cyclomatic=4,cognitive=2
// Fixture for the default-value (constant fallback) exemption: position and fallback shape.
declare function f(s: unknown): void;
declare function g(): string;
declare function g2(s: unknown): void;
declare function noop(): void;
declare function tag(s: TemplateStringsArray): string;
declare function countSelected(s: string[]): number;
declare let s: string;
declare const a: string | null | undefined;
declare const b: string;
declare const c: string;
declare const m: number;
declare const n: number | null;
declare const bi: bigint | undefined;
declare const xs: string[] | null;
declare const o: object | null;
declare const cb: (() => void) | null;
declare const cb2: ((e: unknown) => void) | null;
declare const cb3: ((...args: unknown[]) => void) | null;
declare const cbA: (() => Promise<void>) | null;
declare const cbG: (() => Generator) | null;
declare const isLoading: boolean;
declare const isError: boolean;
declare const isReady: boolean;

function posReturn() {
  return a ?? 'x';
}

function posCallArg() {
  f(a ?? 'x');
}

function posObjectProp() {
  return { v: a ?? 'x' };
}

function posArrayElement() {
  return [a ?? 'x'];
}

function posSpread() {
  return [...(xs ?? [])];
}

function posArrowBody() {
  const getter = () => a ?? 'x';
  return getter;
}

function posTemplate() {
  return `v=${a ?? 'x'}`;
}

function posOtherAssign() {
  let z: string;
  z = a ?? 'x';
  return z;
}

function posSelfAssign() {
  s = s || 'x';
  return s;
}

function posForOf() {
  for (const c of xs ?? []) f(c);
}

function posIfCondition() {
  if (a ?? false) f(a);
}

function posTernaryTest() {
  return (a ?? 'x') ? 1 : 2;
}

function posDeclarator() {
  const v = a ?? 'x';
  return v;
}

function shapeNumber() {
  return n ?? 0b001;
}

function shapeNegative() {
  return n ?? -1;
}

function shapePositive() {
  return n ?? +1;
}

function shapeNegBigInt() {
  return bi ?? -1n;
}

function shapeUndefined() {
  return a ?? undefined;
}

function shapeTemplateEmpty() {
  return a ?? `none`;
}

function shapeArray() {
  return xs ?? [];
}

function shapeObject() {
  return o ?? {};
}

function shapeAsConst() {
  return xs ?? ([] as const);
}

function shapeSatisfies() {
  return xs ?? ([] satisfies string[]);
}

function shapeNonNull() {
  return a ?? ('x'!);
}

function shapeAngle() {
  return a ?? (<string>'x');
}

function shapeParenLiteral() {
  return n ?? (1);
}

function shapeNoopArrow() {
  return cb ?? (() => {});
}

function shapeNoopFunction() {
  return cb ?? function () {};
}

function shapeNoopParam() {
  return cb2 ?? ((_e: Event) => {});
}

function shapeNoopFnParam() {
  return cb2 ?? function (err: unknown) {};
}

function shapeNoopRest() {
  return cb3 ?? ((...args: unknown[]) => {});
}

function shapeNoopComment() {
  return cb ?? (() => {
    /* intentionally empty */
  });
}

function shapeOrOperator() {
  return a || '';
}

function shapeWholeAs() {
  return (a ?? 'none') as string;
}

function shapeWholeSatisfies() {
  return (a ?? '') satisfies string;
}

function shapeWholeAngle() {
  return <number>(n ?? 1);
}

function shapeWholeNonNull() {
  return (a ?? 'x')!;
}

function shapeChainNested() {
  return a ?? (b ?? 'x');
}

function shapeChainLong() {
  return a ?? b ?? c ?? 'x';
}

function shapeChainMixed() {
  return (a || b) ?? 'x';
}

function shapeWholeChainBool() {
  return isLoading || isError || false;
}

function shapeNonEmptyArray() {
  return xs ?? [g()];
}

function shapeRegex() {
  return a ?? /x/;
}

function contParenOr() {
  return a || (b || c);
}

function contParenLeft() {
  return (a || b) || c;
}

function contParenAnd() {
  return isLoading && (isError && isReady);
}

function mixedParenInner() {
  return a || (b ?? 'x');
}

function negIdent() {
  return a ?? b;
}

function negCall() {
  return a || g();
}

function negBools() {
  return isLoading || isError;
}

function negChainNoConst() {
  return a || b || c;
}

function negAndConst() {
  return a && 'x';
}

function negMixedAnd() {
  return (a && b) || [];
}

function negMixedAnd2() {
  return a && b || [];
}

function negAndInOr() {
  return a || (b && c);
}

function negNaN() {
  return n ?? NaN;
}

function negInfinity() {
  return n ?? Infinity;
}

function negNumberConst() {
  return n ?? Number.MAX_VALUE;
}

function negTemplateExpr() {
  return a ?? `x${b}`;
}

function negTaggedTemplate() {
  return a ?? tag`x`;
}

function negNot() {
  return isLoading ?? !0;
}

function negVoid() {
  return n ?? void 0;
}

function negUnaryIdent() {
  return n ?? -m;
}

function negUnaryParen() {
  return n ?? -(m);
}

function negArrowExprBody() {
  return cb ?? (() => undefined);
}

function negArrowParamDefault() {
  return cb2 ?? ((e = g()) => {});
}

function negArrowDestructure() {
  return cb2 ?? (({ a }: { a: string }) => {});
}

function negArrowStmt() {
  return cb ?? (() => {
    noop();
  });
}

function negAsyncNoop() {
  return cbA ?? (async () => {});
}

function negGeneratorNoop() {
  return cbG ?? function* () {};
}

function negCallArg() {
  f(a ?? b);
}

function knownTsWrappedChain() {
  return a ?? ((b ?? 'x') as string);
}

function posParamDefault(p = (a ?? 'x')) {
  return p;
}

function shapeRepro173() {
  const ok1 = n ?? 0b001;
  const ok2 = a ?? "foo";
  const ok3 = xs || [];

  const neg = n ?? -1;
  const undef = a ?? undefined;
  const tpl = a ?? `none`;
  const asFallback = xs ?? ([] as const);
  const satFallback = xs ?? ([] satisfies string[]);
  const asWhole = (a ?? "none") as string;
  const satisfiesWhole = (a ?? "") satisfies string;
  const angleBrace = <number>(x ?? 1);
}

function shapeRepro174() {
  f(a || '');
  g2(new Set([...(xs ?? [])]));
  return { items: xs ?? [], label: a ?? 'x', count: n ?? 0 };
}

function shapeConstArray() {
  return xs ?? ['x'];
}

function shapeConstObject() {
  return o ?? { x: 1, y: [2, { z: null }] };
}

function shapeArrayHole() {
  return xs ?? [, 'x'];
}

function shapeObjectEmptyNested() {
  return o ?? { x: {} };
}

function negArrayCall() {
  return xs ?? [a, g()];
}

function negArraySpread() {
  return xs ?? [...xs];
}

function negObjectCall() {
  return o ?? { v: g() };
}

function negObjectIdent() {
  return o ?? { v: b };
}

function negObjectSpread() {
  return o ?? { ...o };
}

function negObjectComputed() {
  return o ?? { [b]: 1 };
}

function negObjectMethod() {
  return o ?? { m() {} };
}

function negObjectGetter() {
  return o ?? { get v() { return 1; } };
}

function negNestedCall() {
  return o ?? { v: [g()] };
}

function condIf() {
  if (isLoading || isError || false) f(a);
}

function condIfNullish() {
  if (a ?? b ?? false) f(a);
}

function condWhile() {
  while (isLoading || isError || true) f(a);
}

function condWhileSingle() {
  while (a ?? false) f(a);
}

function condDoWhile() {
  do f(a); while (isLoading || isError || false);
}

function condFor() {
  for (; isLoading || isError || false; ) f(a);
}

function condTernary() {
  return (isLoading || isError || false) ? 1 : 2;
}

function condNot() {
  if (!(isLoading || isError || false)) f(a);
}

function condAs() {
  if ((isLoading || isError || false) as boolean) f(a);
}

function condNested() {
  if (isReady && (isLoading || isError || false)) f(a);
}

function condNestedOr() {
  if (isReady || (isLoading || isError || false)) f(a);
}

function condNestedSingle() {
  if (isReady && (a ?? false)) f(a);
}

function condRightNested() {
  if (isLoading || (isError || false)) f(a);
}

function nonCondChain() {
  return isLoading || isError || false;
}

function nonCondAssign() {
  const v = a || b || ''; return v;
}

function nonCondTernaryBranch() {
  return isReady ? (a || b || '') : '';
}

function negObjectGetterEmpty() {
  return o ?? { get v() {} };
}

function condSatisfies() {
  if ((isLoading || isError || false) satisfies boolean) f(a);
}

function condNonNull() {
  if ((isLoading || isError || false)!) f(a);
}

function condAngle() {
  if (<boolean>(isLoading || isError || false)) f(a);
}

function condUnaryMinus() {
  if (-(m || n || 0)) f(a);
}

function condAndInChain() {
  if (isLoading && isError || false) f(a);
}

type State = Record<string, unknown>;

export const buildState = (partial?: Partial<State>): State => ({
  items: partial?.items ?? [],
  pills: partial?.pills ?? [],
  sections: partial?.sections ?? [],
  tags: partial?.tags ?? [],
  isSelected: partial?.isSelected ?? false,
  isSidebarVisible: partial?.isSidebarVisible ?? true,
  isModalOpen: partial?.isModalOpen ?? false,
  isDrawerOpen: partial?.isDrawerOpen ?? false,
  shouldScroll: partial?.shouldScroll ?? true,
  showCount: partial?.showCount ?? false,
  hideEmpty: partial?.hideEmpty ?? false,
  isCollapsed: partial?.isCollapsed ?? false,
  isPinned: partial?.isPinned ?? false,
  title: partial?.title ?? "",
  subtitle: partial?.subtitle ?? "",
  query: partial?.query ?? "",
  sort: partial?.sort ?? "relevance",
  page: partial?.page ?? 1,
  pageSize: partial?.pageSize ?? 20,
  scrollTop: partial?.scrollTop ?? 0,
  count: partial?.count ?? (partial?.sections ? countSelected(partial.sections) : -1),
});
