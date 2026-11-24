import {createApp} from 'vue'
import DesktopOral from './DesktopOral.vue'
import GuidedOral from './GuidedOral.vue'
import './desktop.css'
const address = new URL(location.href)
if (address.searchParams.has('entry')) {
  address.searchParams.delete('entry')
  history.replaceState(history.state, '', address)
}
createApp(new URLSearchParams(location.search).has('legacy') ? DesktopOral : GuidedOral).mount('#atelier')
