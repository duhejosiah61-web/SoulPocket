import { createApp } from 'https://unpkg.com/vue@3/dist/vue.esm-browser.js';
import { setupApp } from './script.js?v=uno202604';

const App = {
    setup() {
        return setupApp();
    }
};

createApp(App).mount('#app');
