// @complexity ListRendering:cyclomatic=1,cognitive=0 FilteredList:cyclomatic=1,cognitive=0
function ListRendering({ items }) {
  return (
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.name}</li>
      ))}
    </ul>
  );
}

function FilteredList({ items }) {
  return (
    <ul>
      {items
        .filter((item) => item.active)
        .map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
    </ul>
  );
}
