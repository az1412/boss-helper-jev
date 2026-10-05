<script lang="ts" setup>
import { VITE_VERSION } from '@/composables/useHelper'
import { getProjectLinks, projectInfo } from '@/utils/projectInfo'

const links = getProjectLinks()
const emits = defineEmits<{
  close: [value: boolean]
}>()
</script>

<template>
  <UModal :title="`${projectInfo.name} · 版本信息`">
    <template #body>
      <div class="space-y-1 text-center">
        <div class="text-sm text-muted">当前版本：{{ VITE_VERSION }}</div>
        <div class="pt-2 text-sm font-medium text-highlighted">本版发布状态</div>
        <p v-if="!links.releases" class="text-sm text-muted">
          本版尚未配置发布地址，请使用本地构建。这里不会将你导向原作者的商店版本。
        </p>
        <p class="text-sm text-muted">在线更新检查未启用，不读取上游远程公告或商店配置。</p>
        <ULink v-if="links.releases" :to="links.releases" target="_blank" rel="noopener noreferrer"
          >查看本版发布记录</ULink
        >
      </div>
    </template>
    <template #footer>
      <div class="dialog-footer">
        <UButton color="primary" @click="emits('close', false)">关闭</UButton>
      </div>
    </template>
  </UModal>
</template>
