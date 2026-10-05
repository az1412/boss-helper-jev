<script setup lang="ts">
import { computed, ref, watch } from 'vue'

import LLMModelManage from '@/components/AI/LLMModelManage.vue'
import LLMPromptEdit from '@/components/AI/LLMPromptEdit.vue'
import { useConf } from '@/composables/conf'
import { useModel } from '@/composables/useModel'
const conf = useConf()
const models = useModel()
const locked = computed(() => conf.runLocked.value || conf.isLoading.value || conf.isSaving.value)
const aiBoxShow = ref(false)
const aiBox = ref<'aiGreeting' | 'aiFiltering'>('aiGreeting')
const error = ref('')
const modelItems = computed(() =>
  models.modelData.value.map((m) => ({ label: m.name, value: m.key })),
)
const filteringMode = computed({
  get: () =>
    conf.formData.jev.enable ? 'jev' : conf.formData.aiFiltering.enable ? 'llm' : 'basic',
  set: (value: string) => {
    conf.formData.jev.enable = value === 'jev'
    conf.formData.aiFiltering.enable = value === 'llm'
  },
})
const greetingMode = computed({
  get: () =>
    conf.formData.aiGreeting.enable
      ? 'ai'
      : conf.formData.customGreeting.enable
        ? 'custom'
        : 'default',
  set: (value: string) => {
    conf.formData.aiGreeting.enable = value === 'ai'
    conf.formData.customGreeting.enable = value === 'custom'
  },
})
async function save() {
  error.value = ''
  try {
    await conf.confSaving()
  } catch {
    error.value = '保存失败，草稿已保留'
  }
}
function editPrompt(key: 'aiGreeting' | 'aiFiltering') {
  aiBox.value = key
  aiBoxShow.value = true
}
watch(conf.runLocked, (value) => {
  if (value) aiBoxShow.value = false
})
</script>
<template>
  <div class="space-y-3">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p role="status" class="text-sm text-muted">
        {{ conf.isSaving.value ? '保存中…' : conf.isDirty.value ? '未保存' : '已保存' }} ·
        与配置页共用草稿
      </p>
      <UButton
        :loading="conf.isSaving.value"
        :disabled="locked || !conf.isDirty.value"
        @click="save"
        >保存配置</UButton
      >
    </div>
    <details class="rounded-xl border border-default p-3" :open="!conf.formData.profile.onboarded">
      <summary class="cursor-pointer text-sm">首次配置：资料 → 筛选 → 招呼方式 → 本轮目标</summary>
      <ol class="mt-2 list-decimal pl-5 text-xs leading-6 text-muted">
        <li>在统计页填写“我的求职意向”，用于 Jev 判断；AI 招呼内容可在下方单独编辑。</li>
        <li>选择筛选方式。使用 Jev 只需 TypeSafe Key；传统 AI 筛选需要下方的模型服务。</li>
        <li>选择默认招呼、自定义文字或 AI 追加招呼。仅启用 AI 追加时才需要招呼语模型。</li>
        <li>保存后到统计页设置本轮上限，再开始。测试连接由你主动点击，可能消耗额度。</li>
      </ol>
    </details>
    <p v-if="conf.runLocked.value" class="text-sm text-warning">运行及暂停收尾期间已锁定设置。</p>
    <fieldset
      :disabled="locked"
      :inert="locked"
      class="space-y-3"
      :class="{ 'opacity-60': locked }"
    >
      <div class="rounded-xl border border-default bg-elevated/40 p-3 space-y-3">
        <UFormField label="岗位筛选方式">
          <USelect
            v-model="filteringMode"
            :items="[
              { label: '基础条件筛选', value: 'basic' },
              { label: 'Jev 语义判定', value: 'jev' },
              { label: '传统 AI 筛选', value: 'llm' },
            ]"
            aria-label="岗位筛选方式"
            class="w-full sm:w-64"
          />
        </UFormField>
        <p class="text-xs text-muted">基础条件始终先执行；Jev 与传统 AI 筛选只使用一种。</p>
        <template v-if="filteringMode === 'jev'">
          <UFormField label="TypeSafe（Jev）API Key"
            ><UInput
              v-model="conf.formData.jev.apiKey"
              type="password"
              autocomplete="off"
              placeholder="从 typesafe.ai 复制"
              class="w-full"
          /></UFormField>
          <p class="text-xs text-muted">
            条件与严格程度取自统计页“我的求职意向”。此密钥不用于生成招呼语。
          </p>
          <UFormField label="投递模式"
            ><USelect
              v-model="conf.formData.jev.mode"
              :items="[
                { label: '快速模式（默认）', value: 'fast' },
                { label: '排序模式', value: 'sorted' },
              ]"
              aria-label="Jev 投递模式"
          /></UFormField>
          <p class="text-xs text-muted">
            快速：判定通过即投递，同时准备下一条。排序：当前批次全部判完后排序投递，不足本轮目标再处理下一批。发送间隔保持设置值。
          </p>
          <a
            href="https://typesafe.ai"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs text-primary underline"
            >前往 TypeSafe 获取密钥</a
          >
        </template>
        <template v-if="filteringMode === 'llm'">
          <UFormField label="筛选模型"
            ><USelect
              v-model="conf.formData.aiFiltering.model"
              :items="modelItems"
              placeholder="先添加模型服务，再选择"
              class="w-full"
          /></UFormField>
          <UButton variant="soft" @click="editPrompt('aiFiltering')">编辑筛选条件与提示词</UButton>
        </template>
      </div>
      <div class="rounded-xl border border-default bg-elevated/40 p-3 space-y-3">
        <UFormField label="招呼方式"
          ><USelect
            v-model="greetingMode"
            :items="[
              { label: '仅平台默认招呼', value: 'default' },
              { label: '追加自定义消息', value: 'custom' },
              { label: '追加 AI 招呼语', value: 'ai' },
            ]"
            aria-label="招呼方式"
            class="w-full sm:w-64"
        /></UFormField>
        <p class="text-xs text-muted">
          平台默认招呼确认成功后，才执行追加消息。Jev 与招呼语模型的额度分别管理。
        </p>
        <p v-if="greetingMode === 'custom'" class="text-xs text-muted">
          到配置页“招呼语配置”编辑自定义消息。
        </p>
        <template v-if="greetingMode === 'ai'">
          <UFormField label="招呼语模型"
            ><USelect
              v-model="conf.formData.aiGreeting.model"
              :items="modelItems"
              placeholder="先添加模型服务，再选择"
              class="w-full"
          /></UFormField>
          <UButton variant="soft" @click="editPrompt('aiGreeting')">编辑招呼内容与提示词</UButton>
        </template>
      </div>
      <LLMModelManage v-if="!conf.runLocked.value"
        ><UButton :disabled="locked">管理模型服务</UButton></LLMModelManage
      >
      <p class="text-xs text-muted">
        模型服务在弹窗里单独保存；本页的筛选方式、招呼方式和模型选择使用上方“保存配置”。
      </p>
    </fieldset>
    <p
      v-if="error || conf.saveError.value || models.error.value"
      role="alert"
      class="text-sm text-error"
    >
      {{ error || conf.saveError.value || models.error.value }}
    </p>
    <LLMPromptEdit
      v-if="aiBoxShow && !conf.runLocked.value"
      :key="aiBox"
      v-model="aiBoxShow"
      :data="aiBox"
    />
  </div>
</template>
