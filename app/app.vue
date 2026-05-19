<template>
  <div class="app">
    <NuxtRouteAnnouncer />
    <NuxtPage />
  </div>
</template>

<style>
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  font-family: 'Segoe UI', system-ui, sans-serif;
  background: #0f0f1a;
  color: #e2e8f0;
}

.app {
  min-height: 100vh;
}

a {
  text-decoration: none;
  color: inherit;
}
</style>
