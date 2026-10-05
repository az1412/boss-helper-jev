<script lang="ts" setup>
import type { FormDataAi } from '@/types/formData'

defineProps<{
  label: string
  lock?: boolean
  help?: string
  disabled?: boolean
  data: Partial<FormDataAi>
}>()

defineEmits<{
  (e: 'change', data: Partial<FormDataAi>): void
  (e: 'show'): void
}>()
</script>

<template>
  <UFieldGroup :data-help="help">
    <UButton
      :color="data.enable ? 'success' : 'neutral'"
      :variant="data.enable ? 'solid' : 'soft'"
      :disabled="lock || disabled"
      @click="$emit('change', data)"
    >
      {{ label }}
    </UButton>
    <UButton
      :color="data.enable ? 'success' : 'neutral'"
      :variant="data.enable ? 'solid' : 'soft'"
      :disabled
      @click="$emit('show')"
    >
      <UIcon name="i-lucide-settings" class="size-4" />
    </UButton>
  </UFieldGroup>
</template>
