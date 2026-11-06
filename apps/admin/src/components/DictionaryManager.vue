<script setup lang="ts">
import { computed, ref } from 'vue';
import { NAlert, NButton, NCard, NEmpty, NForm, NFormItem, NInput, NInputNumber, NModal, NSpace, NSwitch, NTable, NTag, useDialog, useMessage } from 'naive-ui';
import { definitionReferences, type Definition } from '@idv-map/shared/dynamic';
import { storeV2, saveImmediateV2 } from '../store-v2';

const props = defineProps<{ kind: 'modes' | 'entries' }>();
const message = useMessage(), dialog = useDialog();
const title = computed(() => props.kind === 'modes' ? '难度' : '入口');
const definitions = computed(() => props.kind === 'modes' ? storeV2.difficulties : storeV2.entranceTypes);
const rows = computed(() => definitions.value.filter(d => !d.deletedAt).sort((a, b) => a.sort - b.sort));
const references = computed(() => definitionReferences({ gameMaps: storeV2.gameMaps, layouts: storeV2.maps }));
const editing = ref<Definition | null>(null);
const isNew = ref(false);
const error = ref('');
const make = (sort: number): Definition => ({ id: `item-${crypto.randomUUID()}`, name: '', sort, archived: false });
function count(id: string) {
  return (props.kind === 'modes' ? references.value.difficulties : references.value.entranceTypes).get(id) ?? 0;
}
function edit(item?: Definition) {
  isNew.value = !item;
  editing.value = item ? { ...item } : make(Math.max(0, ...rows.value.map(d => d.sort)) + 10);
  error.value = '';
}
async function commit() {
  const draft = editing.value;
  if (!draft || storeV2.saving) return;
  if (!draft.name.trim() || !Number.isFinite(draft.sort)) {
    error.value = '请填写名称和有效排序';
    return;
  }
  const item = { ...draft, name: draft.name.trim() };
  const kind = props.kind;
  error.value = await saveImmediateV2(config => {
    const values = kind === 'entries' ? config.entranceTypes : config.difficulties;
    const existing = values.find(d => d.id === item.id);
    if (existing) Object.assign(existing, JSON.parse(JSON.stringify(item)));
    else values.push(JSON.parse(JSON.stringify(item)));
  }) ?? '';
  if (error.value) return;
  editing.value = null;
  message.success(`${title.value}已保存`);
}
function unused(usage: number) {
  if (usage) {
    message.warning(`仍有 ${usage} 项引用（含草稿和回收站），请先解除引用，或编辑为停用`);
    return false;
  }
  return true;
}
function remove(item: Definition, usage = count(item.id)) {
  if (!unused(usage)) return false;
  item.deletedAt = new Date().toISOString();
  item.archived = true;
  return true;
}
function removeDefinition(item: Definition) {
  if (storeV2.saving || !unused(count(item.id))) return;
  const kind = props.kind;
  dialog.warning({
    title: `删除${title.value}`,
    content: `确定删除「${item.name}」？确认后立即保存。`,
    positiveText: '删除', negativeText: '取消', positiveButtonProps: { type: 'error' },
    async onPositiveClick() {
      const draft = { ...item };
      if (!remove(draft)) return false;
      const failure = await saveImmediateV2(config => {
        const values = kind === 'entries' ? config.entranceTypes : config.difficulties;
        const existing = values.find(d => d.id === item.id);
        if (!existing) throw new Error('字典不存在，请刷新后重试');
        Object.assign(existing, { deletedAt: draft.deletedAt, archived: true });
      });
      if (failure) { message.error(failure, { duration: 10000, closable: true }); return false; }
      message.success(`${title.value}已删除`);
      return true;
    },
  });
}
</script>

<template>
  <n-card :bordered="false" class="dictionary-list">
    <template #header>{{ title }}字典</template>
    <template #header-extra><n-button type="primary" :disabled="storeV2.saving" @click="edit()">新增{{ title }}</n-button></template>
    <div v-if="rows.length" class="table-scroll">
      <n-table :bordered="false" size="medium" class="dictionary-table">
        <thead><tr><th>名称</th><th>顺序</th><th>状态</th><th>引用</th><th>操作</th></tr></thead>
        <tbody>
          <tr v-for="item in rows" :key="item.id">
            <td><strong>{{ item.name }}</strong></td><td>{{ item.sort }}</td>
            <td><n-tag size="small" :type="item.archived ? 'default' : 'success'" :bordered="false">{{ item.archived ? '停用' : '启用' }}</n-tag></td>
            <td>{{ count(item.id) }}</td>
            <td><n-space :size="8" :wrap="false">
              <n-button size="small" secondary :disabled="storeV2.saving" :aria-label="`编辑${title}${item.name}`" @click="edit(item)">编辑</n-button>
              <n-button size="small" quaternary type="error" :disabled="storeV2.saving" :aria-label="`删除${title}${item.name}`" @click="removeDefinition(item)">删除</n-button>
            </n-space></td>
          </tr>
        </tbody>
      </n-table>
    </div>
    <n-empty v-else :description="`暂无${title}`" />
  </n-card>

  <n-modal :show="!!editing" preset="card" :title="`${isNew ? '新增' : '编辑'}${title}`" :style="{ width: '480px', maxWidth: 'calc(100vw - 32px)' }" :mask-closable="false" :closable="!storeV2.saving" :close-on-esc="!storeV2.saving" :auto-focus="true" @update:show="value => { if (!value && !storeV2.saving) editing = null }">
    <n-form v-if="editing" label-placement="top" :disabled="storeV2.saving" @submit.prevent="commit">
      <n-form-item :label="`${title}名称`" required>
        <n-input v-model:value="editing.name" :input-props="{ 'aria-label': `${title}名称` }" placeholder="请输入名称" autofocus />
      </n-form-item>
      <div class="definition-properties">
        <n-form-item label="显示顺序"><n-input-number v-model:value="editing.sort" :input-props="{ 'aria-label': `${title}排序` }" /></n-form-item>
        <n-form-item label="停用"><n-switch v-model:value="editing.archived" :aria-label="`${title}停用`" /></n-form-item>
      </div>
      <n-alert v-if="error" type="error" :show-icon="false">{{ error }}</n-alert>
    </n-form>
    <template #footer><n-space justify="end"><n-button :disabled="storeV2.saving" @click="editing = null">取消</n-button><n-button type="primary" :loading="storeV2.saving" @click="commit">保存</n-button></n-space></template>
  </n-modal>
</template>

<style scoped>
.table-scroll { overflow-x:auto; }
.dictionary-table { min-width:540px; }
.dictionary-table td:last-child { width:136px; }
.dictionary-table th:not(:first-child), .dictionary-table td:not(:first-child) { white-space:nowrap; }
.definition-properties { display:grid; grid-template-columns:1fr 1fr; gap:24px; }
.definition-properties :deep(.n-input-number) { width:100%; }
</style>
