import "./styles/fonts.css";
import "./styles/main.css";
import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./router";
import { retireLegacyCaches } from "./composables/useOfflineCache";
void retireLegacyCaches();
createApp(App).use(router).mount("#app");
