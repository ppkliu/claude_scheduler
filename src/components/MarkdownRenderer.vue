<script setup lang="ts">
import { computed, onMounted, nextTick, watch, ref } from 'vue'
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js'
import 'highlight.js/styles/github-dark.css'

const props = defineProps<{
  content: string
}>()

const containerRef = ref<HTMLElement | null>(null)

// 配置 markdown-it
const md: MarkdownIt = new MarkdownIt({
  html: false,
  linkify: true,
  typographer: true,
  highlight: (str: string, lang: string | undefined): string => {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang }).value
      } catch (_) {}
    }
    return md.utils.escapeHtml(str)
  }
})

const renderedHtml = computed(() => {
  if (!props.content) return ''
  return md.render(props.content)
})

async function addCopyButtons() {
  await nextTick()
  const codeBlocks = containerRef.value?.querySelectorAll('pre code')
  codeBlocks?.forEach((block) => {
    const pre = block.parentElement
    if (!pre) return

    // 避免重複添加
    if (pre.querySelector('.copy-btn')) return

    const wrapper = document.createElement('div')
    wrapper.className = 'code-block-wrapper'
    pre.parentNode?.insertBefore(wrapper, pre)
    wrapper.appendChild(pre)

    const btn = document.createElement('button')
    btn.className = 'copy-btn'
    btn.setAttribute('type', 'button')
    btn.setAttribute('aria-label', 'Copy code')
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect></svg>`
    btn.onclick = () => copyCode(block.textContent || '', btn)
    wrapper.appendChild(btn)
  })
}

function copyCode(code: string, btn: HTMLElement) {
  navigator.clipboard.writeText(code).then(() => {
    const originalContent = btn.innerHTML
    btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`
    btn.classList.add('copied')
    setTimeout(() => {
      btn.innerHTML = originalContent
      btn.classList.remove('copied')
    }, 2000)
  })
}

watch(() => props.content, () => {
  addCopyButtons()
})

onMounted(() => {
  addCopyButtons()
})
</script>

<template>
  <div ref="containerRef" class="markdown-body" v-html="renderedHtml" />
</template>

<style scoped>
.markdown-body {
  font-size: 14px;
  line-height: 1.6;
  color: inherit;
}

/* Headings */
.markdown-body :deep(h1),
.markdown-body :deep(h2),
.markdown-body :deep(h3),
.markdown-body :deep(h4),
.markdown-body :deep(h5),
.markdown-body :deep(h6) {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
}

.markdown-body :deep(h1) {
  font-size: 2em;
  border-bottom: 1px solid hsla(210, 13%, 36%, 0.15);
  padding-bottom: 0.3em;
}

.markdown-body :deep(h2) {
  font-size: 1.5em;
  border-bottom: 1px solid hsla(210, 13%, 36%, 0.15);
  padding-bottom: 0.3em;
}

.markdown-body :deep(h3) {
  font-size: 1.25em;
}

.markdown-body :deep(h4) {
  font-size: 1em;
}

.markdown-body :deep(h5) {
  font-size: 0.875em;
}

.markdown-body :deep(h6) {
  font-size: 0.85em;
  color: #57606a;
}

/* Paragraphs & Text */
.markdown-body :deep(p) {
  margin-bottom: 16px;
}

.markdown-body :deep(strong) {
  font-weight: 600;
}

.markdown-body :deep(em) {
  font-style: italic;
}

/* Links */
.markdown-body :deep(a) {
  color: #0969da;
  text-decoration: none;
  background-color: transparent;
  cursor: pointer;
}

.markdown-body :deep(a:hover) {
  text-decoration: underline;
}

/* Lists */
.markdown-body :deep(ul),
.markdown-body :deep(ol) {
  margin-bottom: 16px;
  padding-left: 2em;
}

.markdown-body :deep(li) {
  margin-bottom: 4px;
}

.markdown-body :deep(ul) {
  list-style-type: disc;
}

.markdown-body :deep(ol) {
  list-style-type: decimal;
}

/* Code */
.markdown-body :deep(code) {
  padding: 0.2em 0.4em;
  margin: 0;
  font-size: 85%;
  background-color: rgba(110, 118, 129, 0.4);
  border-radius: 6px;
  font-family: ui-monospace, SFMono-Regular, SF Mono, Segoe UI Mono, Roboto Mono, "Courier New", monospace;
}

.markdown-body :deep(pre) {
  padding: 16px;
  overflow: auto;
  font-size: 13px;
  line-height: 1.45;
  background-color: #0d1117;
  border-radius: 6px;
  margin-bottom: 16px;
}

.markdown-body :deep(pre code) {
  display: inline;
  padding: 0;
  margin: 0;
  overflow: visible;
  line-height: inherit;
  background-color: transparent;
  border-radius: 0;
  word-wrap: normal;
  color: #c9d1d9;
}

/* Code Block Wrapper */
.code-block-wrapper {
  position: relative;
  margin-bottom: 16px;
}

.code-block-wrapper:hover .copy-btn {
  opacity: 1;
}

.copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 6px 8px;
  background-color: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #c9d1d9;
  border-radius: 4px;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.2s;
  font-size: 12px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.copy-btn:hover {
  background-color: rgba(255, 255, 255, 0.15);
  border-color: rgba(255, 255, 255, 0.3);
}

.copy-btn.copied {
  background-color: rgba(34, 134, 58, 0.2);
  border-color: rgba(34, 134, 58, 0.4);
  color: #3fb950;
}

/* Blockquotes */
.markdown-body :deep(blockquote) {
  padding: 0 1em;
  color: #7d8590;
  border-left: 0.25em solid #d0d7de;
  margin: 0 0 16px 0;
}

/* Tables */
.markdown-body :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin-bottom: 16px;
}

.markdown-body :deep(table tr) {
  background-color: transparent;
  border-top: 1px solid hsla(210, 13%, 36%, 0.15);
}

.markdown-body :deep(table tr:nth-child(2n)) {
  background-color: rgba(110, 118, 129, 0.1);
}

.markdown-body :deep(table th),
.markdown-body :deep(table td) {
  padding: 6px 13px;
  border: 1px solid hsla(210, 13%, 36%, 0.15);
  text-align: left;
}

.markdown-body :deep(table th) {
  font-weight: 600;
  background-color: rgba(110, 118, 129, 0.1);
}

/* Horizontal Rule */
.markdown-body :deep(hr) {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: #d0d7de;
  border: 0;
  border-radius: 6px;
}

/* Images */
.markdown-body :deep(img) {
  max-width: 100%;
  height: auto;
  display: block;
}

/* Line Highlighting for Code Blocks */
.markdown-body :deep(.hljs) {
  color: #c9d1d9;
  background: transparent;
  padding: 0;
}
</style>
