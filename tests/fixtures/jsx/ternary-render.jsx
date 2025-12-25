// @complexity TernaryRender:cyclomatic=2,cognitive=1
function TernaryRender({ isLoggedIn }) {
  return <div>{isLoggedIn ? <UserGreeting /> : <GuestGreeting />}</div>;
}
