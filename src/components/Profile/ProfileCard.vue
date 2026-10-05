<script lang="ts" setup>
import { computed, onMounted, provide, ref } from 'vue'

import { useConf } from '@/composables/conf'
import { jsonClone } from '@/utils/deepmerge'

import ProfileForm from './ProfileForm.vue'

const conf = useConf()
const open = ref(false)
const draft = ref(jsonClone(conf.formData.profile))
const saving = ref(false)
const parsing = ref(false)
const error = ref('')
const cardRef = ref<HTMLElement>()
provide(
  'ProfilePortal',
  computed(() => cardRef.value),
)
const locked = computed(() => conf.runLocked.value || conf.isLoading.value || conf.isSaving.value)

const filled = computed(() => {
  const p = conf.formData.profile
  return !!(p.targetJob?.trim() || p.resume?.trim())
})

const summary = computed(() => {
  const p = conf.formData.profile
  const bits: string[] = []
  if (p.targetJob?.trim()) bits.push(p.targetJob.trim())
  if (p.want?.trim()) bits.push(`要「${p.want.trim()}」`)
  if (p.avoid?.trim()) bits.push(`避「${p.avoid.trim()}」`)
  return bits.join(' · ') || '还没填写求职意向'
})

function edit() {
  if (locked.value) return
  draft.value = jsonClone(conf.getSavedSnapshot().profile)
  error.value = ''
  parsing.value = false
  open.value = true
}

async function save() {
  if (locked.value || saving.value || parsing.value) return
  saving.value = true
  error.value = ''
  try {
    await conf.saveProfile({ ...jsonClone(draft.value), onboarded: true })
    open.value = false
  } catch {
    error.value = '保存失败，输入已保留。请重试或取消。'
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    await conf.confInit()
    if (!conf.formData.profile.onboarded && !filled.value) edit()
  } catch {
    // 初始化错误由配置入口展示，不弹出一份默认值覆盖用户数据。
  }
})
</script>

<template>
  <div ref="cardRef">
    <div class="premium-panel flex items-center gap-3 px-4 py-3">
      <div
        class="flex size-9 shrink-0 items-center justify-center rounded-full"
        :class="filled ? 'bg-help-bg text-help-brand' : 'bg-amber-500/15 text-amber-500'"
      >
        <UIcon :name="filled ? 'i-lucide-user-check' : 'i-lucide-user-plus'" class="size-5" />
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <span class="text-sm font-semibold">我的求职意向</span>
          <span v-if="!filled" class="eyebrow bg-amber-500/15 !text-amber-600">待完善</span>
        </div>
        <div class="truncate text-xs text-muted" :title="summary">{{ summary }}</div>
      </div>
      <UButton
        size="sm"
        :variant="filled ? 'soft' : 'solid'"
        color="primary"
        :disabled="locked"
        @click="edit"
      >
        {{ filled ? '编辑' : '去填写' }}
      </UButton>
    </div>

    <UModal
      v-model:open="open"
      title="填写求职意向"
      description="仅保存这份求职意向，不会连带保存其他设置。取消不会应用本次输入。"
      :dismissible="!saving"
      :close="!saving"
      :ui="{ content: 'sm:max-w-2xl' }"
    >
      <template #body>
        <p v-if="conf.runLocked.value" class="mb-3 text-sm text-warning" role="status">
          运行及暂停收尾期间不能修改求职意向。
        </p>
        <ProfileForm
          v-if="open"
          v-model="draft"
          :disabled="locked || saving"
          @busy="parsing = $event"
        />
        <p v-if="error" role="alert" class="mt-3 text-sm text-error">{{ error }}</p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton color="neutral" variant="outline" :disabled="saving" @click="open = false"
            >取消</UButton
          >
          <UButton color="primary" :disabled="locked || parsing" :loading="saving" @click="save"
            >保存求职意向</UButton
          >
        </div>
      </template>
    </UModal>
  </div>
</template>
