<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<div :class="$style.banner">
		<i class="ti ti-user-check"></i>
	</div>
	<div :class="$style.container">
		<div v-if="!checked" class="_gaps_s">
			<div class="_panel" style="padding: 24px;">
				<MkInput v-model="approvalTicket" type="text" :spellcheck="false">
					<template #label>{{ i18n.ts.approvalTicket }}</template>
					<template #prefix><i class="ti ti-ticket"></i></template>
				</MkInput>
				<MkButton primary rounded large :disabled="!approvalTicket" style="margin: 16px auto 0;" @click="checkStatus">
					{{ i18n.ts.checkStatus }}
				</MkButton>
			</div>
		</div>
		<div v-else-if="status === 'not_found'" class="_gaps_s">
			<div class="_panel" style="padding: 24px; text-align: center;">
				<i class="ti ti-alert-triangle" style="font-size: 48px; color: var(--MI_THEME-error);"></i>
				<div style="margin-top: 16px; font-weight: bold;">{{ i18n.ts.approvalTicketNotFound }}</div>
				<MkButton rounded style="margin-top: 16px;" @click="reset">{{ i18n.ts.back }}</MkButton>
			</div>
		</div>
		<div v-else-if="status === 'approved'" class="_gaps_s">
			<div class="_panel" style="padding: 24px; text-align: center;">
				<i class="ti ti-check" style="font-size: 48px; color: var(--MI_THEME-success);"></i>
				<div style="margin-top: 16px; font-weight: bold;">{{ i18n.ts.approvalApproved }}</div>
				<div style="margin-top: 8px; opacity: 0.7;">{{ i18n.tsx.approvalApprovedDescription({ username: username }) }}</div>
				<MkButton primary rounded large style="margin-top: 16px;" @click="goToLogin">{{ i18n.ts.login }}</MkButton>
			</div>
		</div>
		<div v-else-if="status === 'pending'" class="_gaps_s">
			<div class="_panel" style="padding: 24px;">
				<div style="text-align: center; margin-bottom: 16px;">
					<i class="ti ti-clock" style="font-size: 48px; color: var(--MI_THEME-accent);"></i>
					<div style="margin-top: 16px; font-weight: bold;">{{ i18n.ts.approvalPending }}</div>
					<div style="margin-top: 8px; opacity: 0.7;">{{ i18n.tsx.approvalPendingDescription({ username: username }) }}</div>
				</div>

				<div v-if="messages.length > 0" style="margin-top: 24px;">
					<div style="font-weight: bold; margin-bottom: 12px;">{{ i18n.ts.messages }}</div>
					<div class="_gaps_s">
						<div v-for="msg in messages" :key="msg.id" class="_panel" style="padding: 12px;">
							<div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
								<i :class="msg.isFromAdmin ? 'ti ti-shield-check' : 'ti ti-user'" style="font-size: 16px;"></i>
								<span style="font-weight: bold; font-size: 0.9em;">{{ msg.isFromAdmin ? i18n.ts.administrator : i18n.ts.you }}</span>
								<span style="margin-left: auto; font-size: 0.8em; opacity: 0.6;">{{ new Date(msg.createdAt).toLocaleString() }}</span>
							</div>
							<div style="white-space: pre-wrap;">{{ msg.message }}</div>
						</div>
					</div>
				</div>

				<div class="_gaps_s" style="margin-top: 24px;">
					<MkTextarea v-model="newMessage" :max="4096">
						<template #label>{{ i18n.ts.message }}</template>
					</MkTextarea>
					<MkButton primary rounded :disabled="sending || newMessage.trim() === ''" @click="sendMessage">
						<i class="ti ti-send"></i> {{ i18n.ts.sendMessage }}
					</MkButton>
				</div>

				<MkButton rounded style="margin-top: 16px;" @click="reset">{{ i18n.ts.checkAgain }}</MkButton>
			</div>
		</div>
	</div>
</div>
</template>

<script lang="ts" setup>
import { onMounted, ref } from 'vue';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import * as os from '@/os.js';

const approvalTicket = ref('');
const checked = ref(false);
const status = ref<'pending' | 'approved' | 'not_found' | null>(null);
const username = ref('');
const newMessage = ref('');
const sending = ref(false);
const messages = ref<Array<{
	id: string;
	createdAt: string;
	isFromAdmin: boolean;
	message: string;
}>>([]);

async function checkStatus() {
	if (!approvalTicket.value) return;

	try {
		const result = await misskeyApi('signup/check-status', {
			approvalTicket: approvalTicket.value,
		});

		checked.value = true;
		status.value = result.status;
		username.value = result.username || '';
		messages.value = result.messages || [];
	} catch (err) {
		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
	}
}

async function sendMessage() {
	if (newMessage.value.trim() === '' || sending.value) return;

	sending.value = true;
	try {
		await misskeyApi('signup/send-message', {
			approvalTicket: approvalTicket.value,
			message: newMessage.value.trim(),
		});
		newMessage.value = '';
		await checkStatus();
	} catch (err) {
		os.alert({
			type: 'error',
			text: i18n.ts.somethingHappened,
		});
	} finally {
		sending.value = false;
	}
}

function reset() {
	checked.value = false;
	status.value = null;
	username.value = '';
	messages.value = [];
}

function goToLogin() {
	window.location.href = '/';
}

onMounted(() => {
	approvalTicket.value = new URLSearchParams(window.location.search).get('ticket') ?? '';
	if (approvalTicket.value !== '') {
		checkStatus();
	}
});
</script>

<style lang="scss" module>
.root {
	min-height: 100svh;
	box-sizing: border-box;
	padding: 32px 32px 64px 32px;
	text-align: center;
	background: var(--MI_THEME-bg);
}

.banner {
	padding: 16px;
	text-align: center;
	font-size: 32px;
	background-color: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
	margin-bottom: 32px;
	border-radius: 8px;
}

.container {
	margin: 0 auto;
	max-width: 500px;
}
</style>
