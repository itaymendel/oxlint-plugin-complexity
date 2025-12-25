<template>
  <div class="user-list">
    <div v-for="user in filteredUsers" :key="user.id">
      {{ user.name }}
    </div>
  </div>
</template>

<script lang="ts">
// @complexity filterUsers:cyclomatic=7,cognitive=11
import { defineComponent, computed, ref } from 'vue';

interface User {
  id: number;
  name: string;
  active: boolean;
  role: 'admin' | 'user' | 'guest';
}

export default defineComponent({
  props: {
    users: {
      type: Array as () => User[],
      required: true,
    },
    showInactive: {
      type: Boolean,
      default: false,
    },
  },
  setup(props) {
    const searchQuery = ref('');

    function filterUsers(users: User[]): User[] {
      const result: User[] = [];

      for (const user of users) {
        if (!props.showInactive && !user.active) {
          continue;
        }

        if (searchQuery.value) {
          if (!user.name.toLowerCase().includes(searchQuery.value.toLowerCase())) {
            continue;
          }
        }

        if (user.role === 'guest') {
          continue;
        }

        result.push(user);
      }

      return result;
    }

    const filteredUsers = computed(() => filterUsers(props.users));

    return { filteredUsers, searchQuery };
  },
});
</script>
