<script lang="ts" setup>
import { getProjectLinks, projectInfo } from '@/utils/projectInfo'

const links = getProjectLinks()
</script>

<template>
  <div class="flex flex-row">
    <div class="flex-1">
      <Alert
        :title="projectInfo.name"
        description="基于开源项目的二次开发版本，遵循 MIT License。请遵守招聘平台规则，谨慎设置投递范围与频率。"
        color="primary"
      />
      <div class="flex items-center">
        <div class="hp-about" data-help="本版介绍与开源来源">
          <div class="mt-3 text-sm leading-relaxed text-muted select-text">
            本版在原项目基础上改进了 Jev 语义筛选、运行状态、业务日志和配置保存体验。 开发过程使用
            AI 辅助，不把上游已有功能标为独立原创。
          </div>
          <div class="mt-3 text-sm leading-relaxed select-text">
            <div>本版改进</div>
            <ul class="mt-1 list-disc space-y-1 pl-5 text-muted">
              <li>按求职意向进行 Jev 判定，判定输入变化时更新缓存。</li>
              <li>区分暂停收尾、完成与异常，已发送结果不被后续失败覆盖。</li>
              <li>成功、跳过和异常日志分类查看，支持搜索、复制、导出和脱敏。</li>
              <li>求职意向独立保存，取消和保存失败保留明确的草稿语义。</li>
            </ul>
          </div>
        </div>
      </div>
      <div class="mt-3 text-sm leading-relaxed select-text">
        <template v-if="links.repository">
          本版仓库：
          <ULink :to="links.repository" target="_blank" rel="noopener noreferrer">{{
            links.repository
          }}</ULink>
          <span v-if="links.issues">
            ·
            <ULink :to="links.issues" target="_blank" rel="noopener noreferrer"
              >本版反馈</ULink
            ></span
          >
        </template>
        <p v-else class="text-muted">
          本版仓库及反馈地址尚未配置，暂不提供在线更新或商店下载入口。
        </p>
      </div>
      <div class="mt-3 text-sm leading-relaxed select-text">
        上游来源：
        <ULink :to="projectInfo.upstreamUrl" target="_blank" rel="noopener noreferrer"
          >Ocyss/boss-helper</ULink
        >
        <p class="text-muted">
          基于 MIT
          许可修改。主项目和第三方组件的原版权及完整许可文本随源码保留；上游链接仅用于来源说明，不是本版反馈或更新入口。
        </p>
      </div>
      <p class="mt-3 text-sm leading-relaxed text-muted select-text">
        验证范围以项目文档为准。离线测试不等于真实站点全部功能验证，自动化操作仍可能触发平台限制。
      </p>
    </div>
  </div>
</template>
