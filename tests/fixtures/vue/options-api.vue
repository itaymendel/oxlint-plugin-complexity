<template>
  <div>
    <span v-if="loading">Loading...</span>
    <ul v-else>
      <li v-for="item in items" :key="item.id">{{ item.name }}</li>
    </ul>
  </div>
</template>

<script>
// @complexity fetchItems:cyclomatic=3,cognitive=2 processItem:cyclomatic=3,cognitive=3
export default {
  data() {
    return {
      items: [],
      loading: false,
    };
  },
  methods: {
    async fetchItems() {
      this.loading = true;
      try {
        const response = await fetch('/api/items');
        if (response.ok) {
          this.items = await response.json();
        }
      } catch (error) {
        console.error(error);
      } finally {
        this.loading = false;
      }
    },
    processItem(item) {
      for (const key of Object.keys(item)) {
        if (key.startsWith('_')) {
          delete item[key];
        }
      }
      return item;
    },
  },
};
</script>
