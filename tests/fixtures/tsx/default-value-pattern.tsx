// @complexity Greeting:cyclomatic=3,cognitive=0 JsxPropLiteral:cyclomatic=2,cognitive=0 JsxPropObject:cyclomatic=3,cognitive=0 JsxPropNoop:cyclomatic=2,cognitive=0 JsxPropIdent:cyclomatic=2,cognitive=1 JsxAndParen:cyclomatic=2,cognitive=0
interface GreetingProps {
  name?: string;
  title?: string;
}

function Greeting({ name, title }: GreetingProps): JSX.Element {
  // Default value patterns should NOT add cognitive complexity
  const displayName = name || 'Guest';
  const displayTitle = title || 'Welcome';

  return (
    <div>
      <h1>{displayTitle}</h1>
      <p>Hello, {displayName}!</p>
    </div>
  );
}

declare function C(props: Record<string, unknown>): JSX.Element;

function JsxPropLiteral({ a }: { a?: string }): JSX.Element {
  return <C x={a ?? ''} />;
}

function JsxPropObject({ opts, xs }: { opts?: object; xs?: string[] }): JSX.Element {
  return <C style={opts || {}} items={xs ?? []} />;
}

function JsxPropNoop({ onClick }: { onClick?: (e: unknown) => void }): JSX.Element {
  return <C onClick={onClick ?? ((_e) => {})} />;
}

function JsxPropIdent({ a, b }: { a?: string; b: string }): JSX.Element {
  return <C x={a ?? b} />;
}

function JsxAndParen({ show }: { show: boolean }): JSX.Element {
  return <>{show && (<C x="1" />)}</>;
}
