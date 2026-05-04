<template>
  <div>
    <h1>User Detail</h1>
    <p>ID: {{ userId }}</p>
  </div>
</template>

<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
const userId = route.params.id
</script>
