<script lang="ts" setup>
import { computed, onMounted, ref } from 'vue'

import Log from '@/components/Menu/Log.vue'
import Store from '@/components/Menu/Store.vue'
import Version from '@/components/Menu/Version.vue'
import { counter } from '@/message'
import { logger } from '@/utils/logger'
import { getProjectLinks, projectInfo } from '@/utils/projectInfo'

const links = getProjectLinks()

const toast = useToast()

const confs = {
  store: { name: '存储配置', component: Store, disabled: true },
  log: { name: '日志配置', component: Log, disabled: true },
  version: { name: '版本信息', component: Version, disabled: false },
}

const overlay = useOverlay()

const dropdownItems = computed(() => [
  [{ label: `${projectInfo.name} 配置项` }],
  Object.entries(confs).map(([_, v]) => ({
    label: v.name,
    disabled: v.disabled,
    onSelect: () => {
      overlay
        .create(v.component, {
          destroyOnClose: true,
        })
        .open()
    },
  })),
])

const protocolShow = ref(false)
const protocol = 'boss-protocol'
const protocolVal = '2026/05/24'

function onProtocol() {
  counter.storageSet(protocol, protocolVal)
  protocolShow.value = false
}

onMounted(async () => {
  logger.info(`${projectInfo.name} 挂载成功`)
  toast.add({
    description: `${projectInfo.name} 挂载成功`,
    duration: 2000,
  })

  const protocolDate = await counter.storageGet<string>(protocol)
  protocolShow.value = protocolDate !== protocolVal
})

const container = ref<HTMLDivElement>()
</script>

<template>
  <div ref="container" class="fixed top-18 right-10 z-999">
    <UApp :portal="container" :toaster="{ position: 'top-right', ui: { viewport: 'z-100000' } }">
      <UDropdownMenu :items="dropdownItems">
        <UAvatar
          size="sm"
          :alt="projectInfo.shortName"
          class="cursor-pointer shadow-soft ring-2 ring-white/70 transition-transform duration-300 ease-premium hover:scale-105 hover:ring-help-brand/50"
        />
      </UDropdownMenu>
      <UModal v-model:open="protocolShow">
        <template #body>
          1. 使用前阅读项目 README、各标签页和帮助提示。
          <br />
          2. 本版为开源二次开发项目；求职方向、筛选条件和发送内容由你设置。
          <br />
          3. 修改配置后请保存；运行前确认当前使用的求职意向和额度。
          <br />
          4. 遵守招聘平台规则。遇到验证码或安全验证需人工处理，不尝试绕过限制。
          <br />
          5. 发送结果待核实时先查看平台聊天记录，不要盲目重复发送。
          <br />
          6. 日志与配置导出可能包含求职信息，分享前检查内容，不公开密钥或个人简历。
          <br />
          本项目按 MIT License 提供，原版权与完整许可随源码保留。
          <br />
          自动化操作可能触发平台限制，请自行评估并承担使用风险。
          <br />
          <template v-if="links.repository">
            本版仓库：
            <ULink :to="links.repository" target="_blank" rel="noopener noreferrer">{{
              links.repository
            }}</ULink>
          </template>
          <span v-else>本版仓库与反馈地址尚未配置。</span>
          <br />
          上游来源：
          <ULink :to="projectInfo.upstreamUrl" target="_blank" rel="noopener noreferrer"
            >Ocyss/boss-helper（MIT）</ULink
          >
        </template>
        <template #footer>
          <UButton color="error" @click="onProtocol"> 了解并同意! </UButton>
        </template>
      </UModal>
    </UApp>
  </div>
</template>
