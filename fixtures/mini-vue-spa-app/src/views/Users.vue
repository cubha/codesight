<template>
  <div>
    <h1>Users</h1>
    <ul>
      <li v-for="user in users" :key="user.id">{{ user.name }}</li>
    </ul>
    <UserDetail />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import UserDetail from './UserDetail.vue'
const users = ref([{ id: 1, name: 'Alice' }])
</script>
