// @complexity ConditionalWithLogic:cyclomatic=3 validateUser:cyclomatic=3,cognitive=2

// Helper function (NOT a React component)
function validateUser(user) {
  if (user && user.id) {
    return true;
  }
  return false;
}

// React component - EXCLUDED from cognitive (PascalCase + JSX return)
function ConditionalWithLogic({ user, isAdmin }) {
  if (!user) {
    return <LoginPrompt />;
  }

  return (
    <div>
      <UserProfile user={user} />
      {isAdmin && <AdminPanel />}
    </div>
  );
}
