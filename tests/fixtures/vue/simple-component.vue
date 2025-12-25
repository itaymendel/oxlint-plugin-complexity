<template>
  <div>{{ message }}</div>
</template>

<script>
// @complexity getMessage:cyclomatic=2,cognitive=1
export default {
  data() {
    return { message: 'Hello' };
  },
  methods: {
    getMessage(fallback) {
      if (this.message) {
        return this.message;
      }
      return fallback;
    },
  },
};
</script>
