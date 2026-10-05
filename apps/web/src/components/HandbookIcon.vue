<script setup lang="ts">
defineProps<{
  name:
    | "book"
    | "arrow-left"
    | "arrow-up-right"
    | "globe"
    | "copy"
    | "check"
    | "message"
    | "chevron"
    | "scan";
}>();
const paths = {
  book: "M12 7c-3-3-7-3-10-2v14c3-1 7-1 10 2 3-3 7-3 10-2V5c-3-1-7-1-10 2Zm0 0v14M5 8l4 1M5 12l4 1m6-4 4-1m-4 5 4-1",
  "arrow-left": "M19 12H5m6-6-6 6 6 6",
  "arrow-up-right": "M6 18 18 6M6 6h12v12",
  globe:
    "M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM2 12h20M12 2c5 6 5 14 0 20-5-6-5-14 0-20Z",
  copy: "M9 9h12v12H9ZM15 5V3H3v12h2",
  check: "m5 12 4 4L19 6",
  message: "M21 4H3v13h5l4 4 4-4h5ZM7 8h10M7 12h6",
  chevron: "m6 9 6 6 6-6",
  scan: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 7h3v3H7Zm7 0h3v3h-3ZM7 14h3v3H7Zm7 0h3v3h-3Z",
};
</script>

<template>
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path :d="paths[name]" />
  </svg>
</template>
