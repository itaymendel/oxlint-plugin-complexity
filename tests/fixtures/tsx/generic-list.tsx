// @complexity GenericList:cyclomatic=2 isEmpty:cyclomatic=2,cognitive=1

// Helper function (NOT a React component)
function isEmpty<T>(items: T[]): boolean {
  if (items.length === 0) {
    return true;
  }
  return false;
}

interface ListProps<T> {
  items: T[];
  renderItem: (item: T) => JSX.Element;
  emptyMessage?: string;
}

function GenericList<T extends { id: string }>({
  items,
  renderItem,
  emptyMessage = 'No items',
}: ListProps<T>): JSX.Element {
  if (items.length === 0) {
    return <div className="empty">{emptyMessage}</div>;
  }

  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{renderItem(item)}</li>
      ))}
    </ul>
  );
}
