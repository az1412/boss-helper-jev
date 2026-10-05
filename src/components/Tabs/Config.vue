<script lang="ts" setup>
import { computed, ref } from 'vue'

import Alert from '@/components/Alert.vue'
import { formInfoData, useConf } from '@/composables/conf'
import { getCacheManager } from '@/composables/useApplying'
import { useHelper } from '@/composables/useHelper'

import ConfigItem from './ConfigItem/ConfigItem.vue'

const helper = useHelper()
const conf = useConf()
const configItems = helper.getConfigItems()
const locked = computed(() => conf.runLocked.value || conf.isLoading.value || conf.isSaving.value)
const saveStatus = computed(() =>
  conf.isSaving.value
    ? '保存中…'
    : conf.saveError.value
      ? '保存失败，草稿已保留'
      : conf.isDirty.value
        ? '未保存'
        : '已保存',
)
type PendingAction = { type: 'reload' } | { type: 'switch' | 'create'; value: string }
const pending = ref<PendingAction | null>(null)
const confirmOpen = ref(false)
const changing = ref(false)
const actionError = ref('')
const backupOpen = ref(false)

function exportBackup() {
  conf.confExport(true)
  backupOpen.value = false
}

async function save() {
  if (locked.value) return
  try {
    await conf.confSaving()
  } catch {
    /* saveError 与提示保留失败状态 */
  }
}

async function apply(action: PendingAction, discard = false) {
  if (action.type === 'reload') await conf.confReload(discard ? 'discard' : undefined)
  else if (action.type === 'switch')
    await conf.switchPreset(action.value, discard ? 'discard' : undefined)
  else await conf.createPreset(action.value, discard ? 'discard' : undefined)
}

async function request(action: PendingAction) {
  if (locked.value || changing.value) return
  if (action.type === 'switch' && action.value === conf.formDataPreset.value) return
  actionError.value = ''
  if (conf.isDirty.value) {
    pending.value = action
    confirmOpen.value = true
    return
  }
  try {
    await apply(action)
  } catch {
    actionError.value = '操作失败，当前配置保持不变，请重试。'
  }
}

async function resolveDraft(saveFirst: boolean) {
  if (!pending.value || locked.value || changing.value) return
  changing.value = true
  actionError.value = ''
  try {
    if (saveFirst) await conf.confSaving()
    await apply(pending.value, !saveFirst)
    confirmOpen.value = false
    pending.value = null
  } catch {
    actionError.value = '操作未完成，草稿已保留。请重试或返回修改。'
  } finally {
    changing.value = false
  }
}

async function importConfig() {
  if (locked.value) return
  try {
    await conf.confImport()
  } catch {
    actionError.value = '导入未完成，当前输入已保留。'
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <UTheme
      :ui="{
        formField: {
          root: 'flex max-sm:flex-col justify-between gap-4 items-center',
          container: 'flex-1',
        },
        input: {
          root: 'w-full',
        },
        inputMenu: {
          root: 'w-full',
        },
        inputTags: {
          root: 'w-full',
        },
      }"
    >
      <Alert v-for="(items, index) in configItems[0]" :key="index" v-bind="items" />
      <p role="status" aria-live="polite" class="text-sm text-muted">
        {{ saveStatus }} · 本轮只使用开始时已保存的配置
      </p>
      <p v-if="conf.runLocked.value" class="text-sm text-warning">
        运行及暂停收尾期间已锁定设置与预设。
      </p>
      <p v-if="actionError" role="alert" class="text-sm text-error">{{ actionError }}</p>
      <fieldset :disabled="locked" :inert="locked" :class="{ 'opacity-60': locked }">
        <UForm :disabled="locked">
          <UAccordion
            type="single"
            collapsible
            :items="configItems[1].filter((item) => !!item)"
            :ui="{ content: 'data-[state=open]:pt-1 data-[state=open]:pb-3 px-2 gap-3' }"
            :unmount-on-hide="false"
            default-value="filter"
          >
            <template #body="{ item }">
              <template v-for="(v, i) in item.items" :key="i">
                <ConfigItem v-if="v" :item="v" />
              </template>
            </template>
          </UAccordion>
          <hr class="my-3 border-t border-default" />
          <div class="mt-3 flex flex-row flex-wrap gap-5 items-center">
            <UFormField label="配置级别" :data-help="formInfoData.configLevel['data-help']">
              <USelectMenu
                v-model="conf.formData.configLevel"
                :items="formInfoData.configLevel.options"
                value-key="value"
                label-key="label"
                :search-input="false"
              />
            </UFormField>
            <span data-help="可以在网站管理中打开通知权限,当停止时会自动发送桌面端通知提醒。">
              <UCheckbox label="发送通知" v-model="conf.formData.notification.value" />
            </span>
            <span
              v-if="conf.configLevel.expert || conf.formData.useCache.value"
              data-help="开启后会缓存投递记录，避免重复投递，提高效率。但是缓存功能并不积极维护。可能会有bug，或者意外情况，如遇到可尝试清空缓存或者禁用"
            >
              <UCheckbox label="启用缓存" v-model="conf.formData.useCache.value" />
            </span>
            <UButton
              v-if="conf.formData.useCache.value"
              color="warning"
              @click="() => getCacheManager().clearCache()"
            >
              清空缓存
            </UButton>
            <UFormField label="每日投递上限">
              <UInputNumber
                aria-label="每日投递上限"
                data-help="当天累计达到此数量就停止，最多150；本轮数量在开始按钮上方设置"
                v-model="conf.formData.deliveryLimit.value"
                :min="1"
                :max="150"
                :step="10"
              />
            </UFormField>
          </div>
        </UForm>
        <div class="flex flex-wrap justify-between gap-3 mt-3">
          <div class="flex flex-wrap items-center gap-3">
            <UButton
              color="success"
              data-help="保存配置"
              :loading="conf.isSaving.value"
              :disabled="locked || !conf.isDirty.value"
              @click="save"
            >
              保存配置
            </UButton>
            <UButton
              color="warning"
              data-help="重新加载本地配置"
              @click="request({ type: 'reload' })"
            >
              重载配置
            </UButton>
            <UButton
              color="primary"
              data-help="不同版本的参数可能会调整, 更新之后一键应用, 不会覆盖主要筛选条件"
              @click="conf.confRecommend"
            >
              使用推荐配置
            </UButton>
          </div>
          <div class="flex flex-wrap items-center gap-3">
            <UFormField
              label="预设"
              data-help="切换前可保存或放弃当前草稿；新建预设从已保存的配置复制。"
            >
              <UInputMenu
                :model-value="conf.formDataPreset.value"
                :items="conf.formDataPresets.value"
                value-key="value"
                create-item
                @create="(value: string) => request({ type: 'create', value })"
                @update:model-value="(value: string) => request({ type: 'switch', value })"
              />
            </UFormField>
            <UButton
              color="primary"
              data-help="只导出额度、延时和通用过滤设置；不含密钥、简历、提示词或消息"
              @click="conf.confExport(false)"
            >
              分享配置
            </UButton>
            <UButton color="neutral" variant="outline" @click="backupOpen = true">个人备份</UButton>
            <p class="basis-full my-2 text-xs text-muted">
              分享文件仅保留通用设置。个人备份包含本页、Jev 与简历；大模型服务配置在 AI 页单独备份。
            </p>
            <UButton
              v-if="conf.configLevel.intermediate"
              color="primary"
              data-help="互联网就是要分享"
              @click="importConfig"
            >
              导入配置
            </UButton>
            <UButton
              v-if="conf.configLevel.advanced"
              color="error"
              data-help="清空配置,不会帮你保存,可以重载恢复"
              @click="conf.confDelete"
            >
              清空配置
            </UButton>
          </div>
        </div>
      </fieldset>
    </UTheme>
    <UModal
      v-model:open="backupOpen"
      title="导出个人备份（含敏感信息）"
      description="包含密钥、简历、提示词和消息，仅用于本人恢复，请勿上传 GitHub 或分享。"
    >
      <template #footer
        ><UButton color="neutral" @click="backupOpen = false">取消</UButton
        ><UButton @click="exportBackup">确认导出</UButton></template
      >
    </UModal>
    <UModal
      v-model:open="confirmOpen"
      title="还有未保存的更改"
      description="请选择保存当前设置后继续，或放弃草稿。返回修改不会改变任何配置。"
      :dismissible="!changing"
      :close="!changing"
    >
      <template #body>
        <p v-if="actionError" role="alert" class="text-sm text-error">{{ actionError }}</p>
        <p v-else class="text-sm text-muted">
          求职意向弹窗独立保存；这里处理的是设置与 AI 页的草稿。
        </p>
      </template>
      <template #footer>
        <div class="flex flex-wrap justify-end gap-2">
          <UButton
            color="neutral"
            variant="outline"
            :disabled="changing"
            @click="confirmOpen = false"
            >返回修改</UButton
          >
          <UButton
            color="warning"
            variant="soft"
            :disabled="locked || changing"
            @click="resolveDraft(false)"
            >放弃草稿并继续</UButton
          >
          <UButton :disabled="locked || changing" :loading="changing" @click="resolveDraft(true)"
            >保存并继续</UButton
          >
        </div>
      </template>
    </UModal>
  </div>
</template>
