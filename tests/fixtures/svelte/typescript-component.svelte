<script lang="ts">
// @complexity formatValue:cyclomatic=3,cognitive=3
interface Item {
  id: string;
  value: number;
  label?: string;
}

let items: Item[] = [];

function formatValue(item: Item): string {
  if (!item.label) {
    if (item.value > 100) {
      return `High: ${item.value}`;
    }
    return String(item.value);
  }
  return `${item.label}: ${item.value}`;
}
</script>

<ul>
  {#each items as item}
    <li>{formatValue(item)}</li>
  {/each}
</ul>
