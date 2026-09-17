<script setup lang="ts">
import markUrl from "~/assets/mark.png?url";
</script>

<template>
  <span
    class="ui-mark"
    aria-hidden="true"
    :style="{ '--ui-mark-mask': `url('${markUrl}')` }"
  />
</template>

<style scoped>
/* Official mark PNG as a CSS mask so the silhouette stays pixel-faithful; only currentColor tints. */
.ui-mark {
  display: block;
  width: 100%;
  height: 100%;
  background-color: currentColor;
  -webkit-mask-image: var(--ui-mark-mask);
  mask-image: var(--ui-mark-mask);
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
}
</style>
