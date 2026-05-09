<template>
  <router-view />
</template>

<script setup lang="ts">
import { provide } from 'vue'
import { useApp } from '@/composables/useApp'

const app = useApp()
provide('app', app)
</script>
