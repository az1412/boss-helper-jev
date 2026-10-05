<script lang="ts" setup>
import { inject, onBeforeUnmount, ref } from 'vue'
import type { Ref } from 'vue'

import { strictnessOptions } from '@/composables/useModel/simplePrompt'
import type { FormData } from '@/types/formData'
import { extractPdfText } from '@/utils/pdfText'

const profile = defineModel<FormData['profile']>({ required: true })
const props = defineProps<{ disabled?: boolean }>()
const emit = defineEmits<{ busy: [value: boolean] }>()
const toast = useToast()
const parsing = ref(false)
const fileInput = ref<HTMLInputElement>()
const portal = inject<Ref<HTMLElement> | null>('ProfilePortal', null)
let active = true
onBeforeUnmount(() => {
  active = false
})

function pickFile() {
  if (!props.disabled && !parsing.value) fileInput.value?.click()
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || props.disabled || parsing.value) return
  if (!/\.pdf$/i.test(file.name)) {
    toast.add({ title: '请选择 PDF 简历', color: 'warning' })
    return
  }
  parsing.value = true
  emit('busy', true)
  try {
    const text = await extractPdfText(file)
    // 取消、关闭弹窗或开始运行后，迟到的解析结果不再改写输入。
    if (!active || props.disabled) return
    profile.value.resume = text
    toast.add({ title: '已提取到草稿，请检查简历文字后保存', color: 'success' })
  } catch {
    if (active) toast.add({ title: '简历解析失败，请手动粘贴', color: 'error' })
  } finally {
    parsing.value = false
    if (active) emit('busy', false)
  }
}
</script>

<template>
  <fieldset
    :disabled="disabled"
    :inert="disabled"
    class="space-y-4"
    :class="{ 'opacity-60': disabled }"
  >
    <UFormField
      label="目标岗位"
      help="你想找什么岗位/方向，用于判断岗位合不合适"
      :ui="{ container: 'w-full' }"
    >
      <UInput
        v-model="profile.targetJob"
        placeholder="例如：小学数学教师、班主任 / 前端开发 / 行政人事"
        class="w-full"
      />
    </UFormField>

    <UFormField :ui="{ container: 'w-full' }">
      <template #label>
        <span class="flex items-center gap-2">
          简历 / 自我介绍
          <UButton
            size="xs"
            variant="soft"
            :loading="parsing"
            :disabled="disabled"
            @click="pickFile"
          >
            {{ parsing ? '解析中…' : '上传 PDF 自动填' }}
          </UButton>
        </span>
      </template>
      <input
        ref="fileInput"
        type="file"
        accept="application/pdf,.pdf"
        class="hidden"
        @change="onFile"
      />
      <UTextarea
        v-model="profile.resume"
        :rows="5"
        autoresize
        :maxrows="12"
        class="w-full"
        placeholder="上传 PDF 会自动填在这里，你也可以直接写。用大白话说清：你是谁、几年经验、会什么、想找什么样的工作。AI 打招呼和岗位契合度判断都会用到它。"
      />
    </UFormField>

    <div class="grid gap-4 sm:grid-cols-2">
      <UFormField label="我想要的" help="用顿号或换行分隔多条" :ui="{ container: 'w-full' }">
        <UTextarea
          v-model="profile.want"
          :rows="3"
          autoresize
          class="w-full"
          placeholder="例如：双休、五险一金、离家近、氛围好"
        />
      </UFormField>
      <UFormField label="我不想要的" help="命中会直接排除" :ui="{ container: 'w-full' }">
        <UTextarea
          v-model="profile.avoid"
          :rows="3"
          autoresize
          class="w-full"
          placeholder="例如：纯销售、需要拉客户、长期加班、押工资"
        />
      </UFormField>
    </div>

    <UFormField label="筛选严格程度" help="投得多还是投得准" :ui="{ container: 'w-full' }">
      <USelect
        v-model="profile.strictness"
        :items="strictnessOptions"
        value-key="value"
        label-key="label"
        class="w-full sm:w-60"
        :disabled="disabled"
        :portal="portal ?? false"
      />
    </UFormField>
  </fieldset>
</template>
