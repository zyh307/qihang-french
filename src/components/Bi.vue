<template><view :class="['bi', { inline, small }]"><text class="bi-zh">{{ zh }}</text><text class="bi-fr" lang="fr">{{ fr }}</text></view></template>
<script setup>defineProps({ zh: String, fr: String, inline: Boolean, small: Boolean });</script>
