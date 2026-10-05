<script setup lang="ts">
import type { OpenaiLLMConf } from '@/composables/useModel/openai'
const data = defineModel<OpenaiLLMConf>({ required: true })
function removeTools() {
  data.value.advanced.tools = undefined
  data.value.advanced.tool_choice = undefined
}
const parameters = [
  { key: 'temperature', label: '随机程度 temperature', min: 0, max: 2 },
  { key: 'top_p', label: '采样范围 top_p', min: 0, max: 1 },
  { key: 'presence_penalty', label: '话题惩罚 presence_penalty', min: -2, max: 2 },
  { key: 'frequency_penalty', label: '重复惩罚 frequency_penalty', min: -2, max: 2 },
] as const
const jsonFields = [
  { key: 'extra_headers', label: '额外请求头（JSON，可含密钥）' },
  { key: 'extra_body', label: '额外请求参数（JSON）' },
] as const
const jsonText = (value: unknown) =>
  typeof value === 'string' ? value : value ? JSON.stringify(value, null, 2) : ''
function setJson(key: 'extra_headers' | 'extra_body', value: string) {
  ;(data.value.advanced as any)[key] = value || undefined
}
</script>
<template>
  <div class="space-y-4">
    <UFormField label="接口地址"
      ><UInput
        v-model="data.base_url"
        placeholder="供应商提供的 API 地址，通常以 /v1 结尾"
        class="w-full"
    /></UFormField>
    <UFormField label="API Key"
      ><UInput v-model="data.api_key" type="password" autocomplete="off" class="w-full"
    /></UFormField>
    <UFormField label="模型名称"
      ><UInput v-model="data.model" placeholder="填写供应商支持的模型名称" class="w-full"
    /></UFormField>
    <details class="rounded-xl border border-default p-3">
      <summary class="cursor-pointer text-sm">高级配置与网络选项</summary>
      <div class="mt-3 space-y-4">
        <p class="text-xs text-muted">
          未填写的参数沿用供应商默认值。测试连接与实际运行使用相同设置。
        </p>
        <UCheckbox v-model="data.responses" label="使用 Responses 接口（需供应商支持）" />
        <UCheckbox v-model="data.other.background" label="后台请求（浏览器跨域失败时使用）" />
        <UFormField label="请求超时（秒）"
          ><UInputNumber
            v-model="data.other.timeout"
            :min="1"
            :max="86400"
            placeholder="默认 1800 秒"
        /></UFormField>
        <UCheckbox
          :model-value="data.advanced.stream !== false"
          @update:model-value="data.advanced.stream = !!$event"
          label="流式请求（不支持时关闭）"
        />
        <UCheckbox
          :model-value="data.advanced.json !== false"
          @update:model-value="data.advanced.json = !!$event"
          label="传统 AI 筛选强制 JSON（不影响 Jev 或招呼语）"
        />
        <UFormField v-for="item in parameters" :key="item.key" :label="item.label">
          <div class="flex gap-2">
            <UInputNumber
              v-model="data.advanced[item.key]"
              :min="item.min"
              :max="item.max"
              :step="0.05"
              placeholder="供应商默认"
            /><UButton color="neutral" variant="ghost" @click="data.advanced[item.key] = undefined"
              >默认</UButton
            >
          </div>
        </UFormField>
        <UFormField v-for="item in jsonFields" :key="item.key" :label="item.label">
          <UTextarea
            :model-value="jsonText(data.advanced[item.key])"
            @update:model-value="setJson(item.key, $event)"
            :rows="3"
            class="w-full"
            placeholder="{}"
          />
        </UFormField>
        <p class="text-xs text-muted">额外参数不能覆盖核心消息、模型及流式设置。不使用工具调用。</p>
        <UButton
          v-if="data.advanced.tools || data.advanced.tool_choice"
          color="warning"
          variant="soft"
          @click="removeTools"
          >移除旧工具调用参数</UButton
        >
      </div>
    </details>
  </div>
</template>
