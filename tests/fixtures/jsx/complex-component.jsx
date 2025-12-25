// @complexity ComplexComponent:cyclomatic=5 helperWithCondition:cyclomatic=2,cognitive=1

// Helper function (NOT a React component - lowercase name)
function helperWithCondition(value) {
  if (value) {
    return value * 2;
  }
  return 0;
}

// React component - EXCLUDED from cognitive (PascalCase + JSX return)
function ComplexComponent({ data, loading, error }) {
  if (loading) {
    return <LoadingSpinner />;
  }

  if (error) {
    return <ErrorMessage message={error} />;
  }

  if (!data || data.length === 0) {
    return <EmptyState />;
  }

  return (
    <div>
      {data.map((item) => (
        <Card key={item.id}>
          {item.featured && <Badge>Featured</Badge>}
          <Title>{item.title}</Title>
        </Card>
      ))}
    </div>
  );
}
