<template>
  <div>
    <button @click="increment">Count: {{ count }}</button>
  </div>
</template>

<script setup lang="ts">
// @complexity useCounter:cyclomatic=1,cognitive=1
import { ref, computed } from 'vue';

function useCounter(initial: number = 0) {
  const count = ref(initial);

  const increment = () => {
    if (count.value < 100) {
      count.value++;
    }
  };

  return { count, increment };
}

const { count, increment } = useCounter();
</script>
