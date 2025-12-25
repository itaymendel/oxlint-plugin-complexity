// @complexity processUser:cyclomatic=2,cognitive=1 helperFunction:cyclomatic=2,cognitive=1

// React component - EXCLUDED (PascalCase + returns JSX)
// Should NOT appear in results
function UserCard({ name, active }) {
  if (active) {
    return <div className="active">{name}</div>;
  }
  return <div>{name}</div>;
}

// React component - EXCLUDED
function StatusBadge({ status }) {
  if (status === 'error') {
    return <span className="error">Error</span>;
  }
  return <span>{status}</span>;
}

// NOT a React component - lowercase name
// Should appear in results with cyclomatic=2, cognitive=1
function processUser(user) {
  if (user.active) {
    return user;
  }
  return null;
}

// NOT a React component - no JSX return
// Should appear in results
function helperFunction(data) {
  if (data) {
    return data.value;
  }
  return 0;
}
