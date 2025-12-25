// @complexity Greeting:cyclomatic=3,cognitive=0
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
