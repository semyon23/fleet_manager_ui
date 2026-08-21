import { createRouter, createWebHistory } from 'vue-router'

const routes = [
  { path: '/', redirect: '/dashboard' },
  { path: '/dashboard', name: 'dashboard', component: () => import('../views/DashboardView.vue'), meta: { title: 'Dashboard' } },
  { path: '/map', name: 'map', component: () => import('../views/LiveMapView.vue'), meta: { title: 'Live Map' } },
  { path: '/map-editor', name: 'map-editor', component: () => import('../views/MapEditorView.vue'), meta: { title: 'Map Editor' } },
  { path: '/robots', name: 'robots', component: () => import('../views/RobotsView.vue'), meta: { title: 'Robots' } },
  { path: '/missions', name: 'missions', component: () => import('../views/MissionsView.vue'), meta: { title: 'Missions' } },
  { path: '/alerts', name: 'alerts', component: () => import('../views/AlertsView.vue'), meta: { title: 'Alerts' } },
  { path: '/teleop', name: 'teleop', component: () => import('../views/TeleopView.vue'), meta: { title: 'Teleop' } },
  { path: '/settings', name: 'settings', component: () => import('../views/SettingsView.vue'), meta: { title: 'Settings' } },
]

const router = createRouter({
  history: createWebHistory('/fleet-manager/'),
  routes,
})

router.afterEach((to) => {
  document.title = to.meta.title ? `${to.meta.title} · Fleet Manager` : 'Fleet Manager'
})

export default router
