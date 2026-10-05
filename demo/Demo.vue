<script setup lang="ts">
import App from '../src/App.vue'
import { useHelper } from '../src/composables/useHelper'
import { scenario } from './helper'
import { fault } from './message'
const helper = useHelper() as any
function toggleTheme() {
  document.documentElement.classList.toggle('dark')
}
</script>

<template>
  <header class="demo-banner">
    <strong>离线交互验证 · 不发送真实消息</strong>
    <span>使用真实界面与工作流；站点、存储和 AI 响应均为本地样例。</span>
    <div class="demo-actions">
      <label
        >测试场景
        <select v-model="scenario" :disabled="helper.workflow.busy.value">
          <option value="normal">正常处理</option>
          <option value="send-error">模拟发送失败</option>
          <option value="extra-error">模拟追加失败</option>
        </select></label
      >
      <button @click="helper.loadDemo()" :disabled="helper.workflow.busy.value">
        重新加载样例
      </button>
      <button @click="helper.loadDemo(true)" :disabled="helper.workflow.busy.value">空列表</button>
      <button @click="fault.failNextSave = true">模拟下次保存失败</button>
      <button @click="toggleTheme">切换深浅色</button>
    </div>
  </header>
  <div class="job-search-wrapper" aria-label="站点筛选替身">
    <div class="job-search-box">BOSS 原生搜索条件（离线占位，不改变真实搜索）</div>
    <div class="search-condition-wrapper">城市 / 薪资 / 经验（站点替身）</div>
  </div>
  <App />
  <footer class="demo-footer">页面底部：横向卡片到边界时，滚轮应能继续滚动整个页面。</footer>
</template>

<style>
html {
  background: #f3f5f7;
}
html.dark {
  background: #14181f;
  color: #e5e7eb;
}
body {
  margin: 0;
}
.demo-banner {
  max-width: 1136px;
  margin: 1.5rem auto 0;
  padding: 1rem;
  border: 1px solid #80909d;
  border-radius: 12px;
  font: 14px/1.6 system-ui;
}
.demo-banner strong,
.demo-banner span {
  display: block;
}
.demo-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
}
.demo-actions button,
.demo-actions select {
  border: 1px solid #a1adb5;
  padding: 4px 10px;
  border-radius: 6px;
  background: transparent;
  font: inherit;
  cursor: pointer;
}
.demo-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.demo-footer {
  padding: 6rem 1rem;
  text-align: center;
  font: 14px system-ui;
}
.job-search-wrapper {
  max-width: 1136px;
  margin: 10px auto;
  font: 12px system-ui;
  color: #586573;
}
</style>
