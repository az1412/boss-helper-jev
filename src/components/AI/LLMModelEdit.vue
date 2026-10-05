<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'

import type { ModelConf } from '@/composables/useModel'
import { useModel } from '@/composables/useModel'
import { normalizeModelConfig } from '@/composables/useModel/openai'
import type { OpenaiLLMConf } from '@/composables/useModel/openai'
import { matchPreset, providerPresets } from '@/composables/useModel/presets'
import { explainProbeError, probeModel } from '@/composables/useModel/probe'
import { jsonClone } from '@/utils/deepmerge'

import LLMForm from './LLMForm.vue'

const props = defineProps<{ model?: ModelConf }>()
const modelStore = useModel()
const emit = defineEmits<{ create: [data: ModelConf] }>()
const show = defineModel<boolean>({ required: true })
const draft = ref<OpenaiLLMConf>(
  jsonClone(
    props.model?.data ?? {
      mode: 'openai',
      base_url: '',
      api_key: '',
      model: '',
      avatar: '',
      advanced: {},
      other: {},
    },
  ),
)
draft.value.advanced ??= {}
draft.value.other ??= {}
const name = ref(props.model?.name ?? '')
const providerId = ref(matchPreset(draft.value.base_url)?.id ?? 'custom')
const preset = computed(() => providerPresets.find((p) => p.id === providerId.value))
const error = ref('')
const result = ref('')
const probing = ref(false)
let controller: AbortController | undefined
watch(providerId, (value, previous) => {
  const item = providerPresets.find((p) => p.id === value)
  if (!item) return
  draft.value.api_key = ''
  result.value = ''
  if (item.id === 'custom') return
  const old = providerPresets.find((p) => p.id === previous)
  draft.value.base_url = item.baseUrl
  if (!draft.value.model || old?.models.includes(draft.value.model))
    draft.value.model = item.models[0] ?? ''
  if (!name.value || name.value === old?.name) name.value = item.name
  result.value = ''
})
watch(show, (value) => {
  if (!value) controller?.abort()
})
onUnmounted(() => controller?.abort())
async function test() {
  if (probing.value) return
  error.value = ''
  result.value = ''
  let data: OpenaiLLMConf
  try {
    data = normalizeModelConfig(draft.value)
  } catch (e) {
    error.value = (e as Error).message
    return
  }
  probing.value = true
  modelStore.testing.value++
  controller = new AbortController()
  try {
    result.value = await probeModel(data, { signal: controller.signal })
  } catch (e) {
    error.value = explainProbeError(e)
  } finally {
    probing.value = false
    modelStore.testing.value--
    controller = undefined
  }
}
function apply() {
  error.value = ''
  try {
    if (!name.value.trim()) throw new Error('请填写配置名称')
    emit('create', {
      key: props.model?.key ?? crypto.randomUUID(),
      name: name.value.trim(),
      color: props.model?.color,
      data: normalizeModelConfig(draft.value),
    })
  } catch (e) {
    error.value = (e as Error).message
  }
}
</script>
<template>
  <UModal
    v-model:open="show"
    :title="model ? '编辑模型' : '添加模型'"
    :ui="{ content: 'sm:max-w-2xl' }"
    :dismissible="false"
  >
    <template #body>
      <fieldset :disabled="probing" class="space-y-4">
        <UFormField label="供应商"
          ><USelect
            v-model="providerId"
            :items="providerPresets.map((p) => ({ label: p.name, value: p.id }))"
            :portal="false"
            class="w-full"
        /></UFormField>
        <p v-if="preset?.note" class="text-xs text-muted">
          {{ preset.note }}。切换供应商后需重新填写密钥。
        </p>
        <UFormField label="配置名称"
          ><UInput v-model="name" placeholder="例如：我的招呼语模型" class="w-full"
        /></UFormField>
        <LLMForm v-model="draft" />
        <div v-if="preset?.models.length" class="flex flex-wrap gap-2">
          <span class="text-xs text-muted">模型示例（可手动填写）：</span>
          <UButton
            v-for="item in preset.models"
            :key="item"
            size="xs"
            variant="soft"
            @click="draft.model = item"
            >{{ item }}</UButton
          >
        </div>
      </fieldset>
      <p class="mt-3 text-xs text-muted">
        测试连接会使用当前输入发送一次最小请求，可能消耗供应商额度；不会向 HR 发送消息。
      </p>
      <p v-if="error" role="alert" class="mt-2 text-sm text-error">{{ error }}</p>
      <p v-if="result" role="status" class="mt-2 text-sm text-success">{{ result }}</p>
    </template>
    <template #footer>
      <div class="flex flex-wrap gap-2">
        <UButton color="neutral" variant="outline" @click="show = false">取消</UButton>
        <UButton color="neutral" :loading="probing" @click="test">测试连接</UButton>
        <UButton v-if="probing" color="neutral" variant="ghost" @click="controller?.abort()"
          >取消测试</UButton
        >
        <UButton :disabled="probing" @click="apply">应用到草稿</UButton>
      </div>
    </template>
  </UModal>
</template>
