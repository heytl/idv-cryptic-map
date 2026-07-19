<script setup lang="ts">
import { darkTheme, dateZhCN, NConfigProvider, NDialogProvider, NMessageProvider, zhCN } from 'naive-ui';
import Shell from './components/Shell.vue';
import { themeOverrides } from './ui';
</script>

<template>
  <n-config-provider :theme="darkTheme" :theme-overrides="themeOverrides" :locale="zhCN" :date-locale="dateZhCN">
    <n-dialog-provider>
      <n-message-provider>
        <Shell />
      </n-message-provider>
    </n-dialog-provider>
  </n-config-provider>
</template>
