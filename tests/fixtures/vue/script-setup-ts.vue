<template>
  <div>
    <input v-model="searchTerm" placeholder="Search..." />
    <div v-if="isLoading">Loading...</div>
    <div v-else-if="error">Error: {{ error }}</div>
    <ul v-else>
      <li v-for="item in filteredItems" :key="item.id">
        {{ item.name }}
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
// @complexity useFetchData:cyclomatic=3,cognitive=2 filterItems:cyclomatic=2,cognitive=2
import { ref, computed, onMounted } from 'vue';

interface Item {
  id: string;
  name: string;
  category: string;
}

const items = ref<Item[]>([]);
const searchTerm = ref('');
const isLoading = ref(false);
const error = ref<string | null>(null);

async function useFetchData(url: string): Promise<void> {
  isLoading.value = true;
  error.value = null;

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch');
    }
    items.value = await response.json();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    isLoading.value = false;
  }
}

function filterItems(items: Item[], term: string): Item[] {
  if (!term) {
    return items;
  }

  return items.filter((item) => {
    if (item.name.includes(term)) {
      return true;
    }
    if (item.category.includes(term)) {
      return true;
    }
    return false;
  });
}

const filteredItems = computed(() => filterItems(items.value, searchTerm.value));

onMounted(() => useFetchData('/api/items'));
</script>
