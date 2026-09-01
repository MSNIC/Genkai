<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :tabs="headerTabs">
	<div class="_spacer" style="--MI_SPACER-w: 700px; --MI_SPACER-min: 16px; --MI_SPACER-max: 32px;">
		<div class="_gaps">
			<div v-if="pendingUsers.length === 0" class="_panel" style="padding: 16px; text-align: center;">
				<div style="opacity: 0.6;">{{ i18n.ts.noApprovalsPending }}</div>
			</div>
			<div v-for="user in pendingUsers" :key="user.id" class="_panel" style="padding: 16px;">
				<div style="display: flex; gap: 16px;">
					<div style="flex: 1;">
						<div style="font-weight: bold; margin-bottom: 8px;">@{{ user.username }}</div>
						<div style="font-size: 0.9em; opacity: 0.7; margin-bottom: 4px;">
							{{ i18n.ts.approvalTicket }}: <code>{{ user.approvalTicket }}</code>
						</div>
						<div style="font-size: 0.9em; opacity: 0.7; margin-bottom: 8px;">
							{{ i18n.ts.userRegisteredAt }}: {{ new Date(user.createdAt).toLocaleString() }}
						</div>
						<div v-if="user.signupReason" style="margin-top: 12px;">
							<div style="font-weight: bold; margin-bottom: 4px;">{{ i18n.ts.signupReason }}:</div>
							<div style="white-space: pre-wrap; padding: 8px; background: var(--MI_THEME-panel); border-radius: 4px;">{{ user.signupReason }}</div>
						</div>
						<div v-if="user.messages.length > 0" class="_gaps_s" style="margin-top: 12px;">
							<div style="font-weight: bold;">{{ i18n.ts.messages }}</div>
							<div v-for="message in user.messages" :key="message.id" style="padding: 8px; background: var(--MI_THEME-panel); border-radius: 4px;">
								<div style="font-size: 0.8em; opacity: 0.7;">{{ message.isFromAdmin ? i18n.ts.administrator : i18n.ts.user }} · {{ new Date(message.createdAt).toLocaleString() }}</div>
								<div style="white-space: pre-wrap; margin-top: 4px;">{{ message.message }}</div>
							</div>
						</div>
					</div>
					<div style="display: flex; flex-direction: column; gap: 8px;">
						<MkButton primary @click="approve(user)">
							<i class="ti ti-check"></i> {{ i18n.ts.approve }}
						</MkButton>
						<MkButton danger @click="reject(user)">
							<i class="ti ti-x"></i> {{ i18n.ts.approvalReject }}
						</MkButton>
						<MkButton @click="sendMessage(user)">
							<i class="ti ti-message"></i> {{ i18n.ts.sendMessage }}
						</MkButton>
					</div>
				</div>
			</div>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted } from 'vue';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';
import { definePage } from '@/page.js';

const headerTabs = computed(() => []);

type PendingUser = {
	id: string;
	username: string;
	approvalTicket: string;
	createdAt: string;
	signupReason: string | null;
	messages: Array<{
		id: string;
		createdAt: string;
		isFromAdmin: boolean;
		message: string;
	}>;
};

const pendingUsers = ref<PendingUser[]>([]);

async function loadPendingUsers() {
	const users = await misskeyApi('admin/approvals/list', {
		limit: 30,
		offset: 0,
	});
	pendingUsers.value = users;
}

async function approve(user: PendingUser) {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.tsx.approveConfirm({ user: `@${user.username}` }),
	});

	if (confirm.canceled) return;

	await misskeyApi('admin/approvals/approve', {
		userId: user.id,
	});

	os.toast(i18n.tsx.userApproved({ user: `@${user.username}` }));
	await loadPendingUsers();
}

async function reject(user: PendingUser) {
	const confirm = await os.confirm({
		type: 'warning',
		text: i18n.tsx.rejectConfirm({ user: `@${user.username}` }),
	});

	if (confirm.canceled) return;

	await misskeyApi('admin/approvals/reject', {
		userId: user.id,
	});

	os.toast(i18n.tsx.userRejected({ user: `@${user.username}` }));
	await loadPendingUsers();
}

async function sendMessage(user: PendingUser) {
	const { canceled, result: message } = await os.inputText({
		title: i18n.tsx.sendMessageTo({ user: `@${user.username}` }),
		placeholder: i18n.ts.message,
		minLength: 1,
		maxLength: 4096,
	});

	if (canceled || !message) return;

	await misskeyApi('admin/approvals/send-message', {
		userId: user.id,
		message: message,
	});

	os.toast(i18n.ts.messageSent);
	await loadPendingUsers();
}

onMounted(() => {
	loadPendingUsers();
});

definePage(() => ({
	title: i18n.ts.approvalManagement,
	icon: 'ti ti-user-check',
}));
</script>
