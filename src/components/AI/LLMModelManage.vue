<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'

import { useConf } from '@/composables/conf'
import { useModel } from '@/composables/useModel'
import type { ModelConf } from '@/composables/useModel'
import { validateModels } from '@/composables/useModel/modelSettings'
import { jsonClone } from '@/utils/deepmerge'
import { exportJson, importJson } from '@/utils/jsonImportExport'
import { shareModels } from '@/utils/shareConfig'

import ModelEdit from './LLMModelEdit.vue'
const store = useModel()
const conf = useConf()
const open = ref(false)
const draft = ref<ModelConf[]>([])
const editOpen = ref(false)
const selected = ref<ModelConf>()
const backupOpen = ref(false)
function exportBackup() {
  exportJson(draft.value, '模型个人备份-含密钥')
  backupOpen.value = false
}
const error = ref('')
const loading = ref(false)
const locked = computed(() => loading.value || store.saving.value || conf.runLocked.value)
const dirty = computed(() => JSON.stringify(draft.value) !== JSON.stringify(store.modelData.value))
watch(open, async (value) => {
  if (!value) {
    store.editing.value = false
    editOpen.value = false
    return
  }
  if (conf.runLocked.value) {
    open.value = false
    return
  }
  store.editing.value = true
  loading.value = true
  error.value = ''
  try {
    await store.initModel()
    draft.value = store.snapshot()
  } catch {
    error.value = store.error.value
  } finally {
    loading.value = false
  }
})
onUnmounted(() => {
  store.editing.value = false
})
function selectedKeys() {
  return [conf.formData, conf.getSavedSnapshot()]
    .flatMap((data) => [data.aiGreeting?.model, data.aiFiltering?.model])
    .filter(Boolean)
}
function remove(item: ModelConf) {
  if (selectedKeys().includes(item.key)) {
    error.value = '该模型仍被招呼语或传统 AI 筛选选用，请先更换并保存对应模型'
    return
  }
  draft.value = draft.value.filter((m) => m.key !== item.key)
}
function edit(item?: ModelConf) {
  selected.value = item
  editOpen.value = true
}
function copy(item: ModelConf) {
  apply({ ...jsonClone(item), key: crypto.randomUUID(), name: item.name + ' 副本' })
}
function apply(item: ModelConf) {
  const index = draft.value.findIndex((m) => m.key === item.key)
  if (index < 0) draft.value.push(item)
  else draft.value[index] = item
  editOpen.value = false
}
async function save() {
  if (locked.value) return
  error.value = ''
  try {
    if (selectedKeys().some((key) => !draft.value.some((m) => m.key === key)))
      throw new Error('当前选用的模型不在列表中，请先更换对应模型')
    await store.saveModel(draft.value)
    open.value = false
  } catch (e) {
    error.value = (e as Error).message
  }
}
async function load() {
  try {
    const input = await importJson<unknown>()
    if (conf.runLocked.value || !open.value) return
    draft.value = validateModels(input, true)
    error.value = ''
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>
<template>
  <UModal
    v-model:open="open"
    title="模型服务配置"
    :ui="{ content: 'sm:max-w-2xl' }"
    :dismissible="false"
    :close="!store.saving.value"
  >
    <slot />
    <template #body>
      <p class="mb-3 text-xs text-muted">
        这里配置用于招呼语或传统 AI 筛选的大模型。Jev 密钥在 AI
        页单独填写。编辑应用后，点击本窗口“保存模型配置”才会生效。
      </p>
      <fieldset :disabled="locked" :inert="locked" class="space-y-3">
        <div v-for="item in draft" :key="item.key" class="rounded-xl border border-default p-3">
          <p class="font-medium wrap-anywhere">
            {{ item.name }} <span class="text-xs text-muted">{{ item.data?.model }}</span>
          </p>
          <p class="text-xs text-muted wrap-anywhere">{{ item.data?.base_url }}</p>
          <div class="mt-2 flex gap-2">
            <UButton size="xs" variant="soft" @click="edit(item)">编辑</UButton
            ><UButton size="xs" color="neutral" variant="ghost" @click="copy(item)">复制</UButton
            ><UButton size="xs" color="error" variant="ghost" @click="remove(item)">删除</UButton>
          </div>
        </div>
        <p v-if="!draft.length" class="text-sm text-muted">
          尚未配置模型。仅使用 Jev 筛选和默认招呼时，可跳过此项。
        </p>
      </fieldset>
      <p v-if="dirty" class="mt-3 text-xs text-warning">有未保存的模型修改；取消或关闭将放弃。</p>
      <p v-if="error" role="alert" class="mt-2 text-sm text-error">{{ error }}</p>
      <ModelEdit v-if="editOpen" v-model="editOpen" :model="selected" @create="apply" />
    </template>
    <template #footer>
      <div class="flex flex-wrap gap-2">
        <UButton
          color="neutral"
          variant="outline"
          :disabled="store.saving.value"
          @click="open = false"
          >取消</UButton
        >
        <UButton
          color="neutral"
          :disabled="locked"
          @click="exportJson(shareModels(draft), '模型分享-需自行填写密钥')"
          >分享配置</UButton
        >
        <UButton color="neutral" :disabled="locked" @click="backupOpen = true">个人备份</UButton>
        <UButton color="neutral" :disabled="locked" @click="load">导入</UButton>
        <UButton :disabled="locked" @click="edit()">添加模型</UButton>
        <UButton :loading="store.saving.value" :disabled="locked || !dirty" @click="save"
          >保存模型配置</UButton
        >
      </div>
    </template>
  </UModal>
  <UModal
    v-model:open="backupOpen"
    title="备份模型配置（含密钥）"
    description="包含当前模型草稿的密钥和额外请求头，仅供本人恢复，请勿分享。"
  >
    <template #footer
      ><UButton color="neutral" @click="backupOpen = false">取消</UButton
      ><UButton
        @click="exportBackup"
        >确认导出</UButton
      ></template
    >
  </UModal>
</template>
