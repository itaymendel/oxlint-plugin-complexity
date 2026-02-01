<script>
// @complexity handleClick:cyclomatic=2,cognitive=1
let count = 0;

function handleClick(increment) {
  if (increment) {
    count += 1;
  }
}
</script>

<button on:click={() => handleClick(true)}>
  Clicked {count} times
</button>
