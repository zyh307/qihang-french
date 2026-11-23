import {createApp} from 'vue'
import DesktopOral from './DesktopOral.vue'
import GuidedOral from './GuidedOral.vue'
import './desktop.css'
createApp(new URLSearchParams(location.search).has('legacy') ? DesktopOral : GuidedOral).mount('#atelier')
