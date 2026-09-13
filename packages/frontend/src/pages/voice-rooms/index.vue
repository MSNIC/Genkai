<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader :actions="headerActions">
	<div class="_spacer _gaps" style="--MI_SPACER-w: 760px;">
		<form v-if="showCreate" class="_panel _gaps" :class="$style.form" @submit.prevent="createRoom">
			<MkInput v-model="title" required :maxlength="256">
				<template #label>{{ i18n.ts._voiceRooms.roomTitle }}</template>
			</MkInput>
			<MkTextarea v-model="description" :maxlength="2048">
				<template #label>{{ i18n.ts._voiceRooms.description }}</template>
			</MkTextarea>
			<MkSwitch v-model="startImmediately">{{ i18n.ts._voiceRooms.startImmediately }}</MkSwitch>
			<MkSwitch v-model="recordingEnabled">{{ i18n.ts._voiceRooms.record }}</MkSwitch>
			<MkButton type="submit" primary :disabled="creating || title.trim() === ''"><i class="ti ti-broadcast"></i> {{ i18n.ts._voiceRooms.create }}</MkButton>
		</form>

		<MkLoading v-if="loading"/>
		<MkResult v-else-if="rooms.length === 0" type="empty" :text="i18n.ts._voiceRooms.noRooms"/>
		<div v-else :class="$style.rooms">
			<MkA v-for="room in rooms" :key="room.id" :to="`/voice-rooms/${room.id}`" class="_panel" :class="$style.room">
				<div :class="$style.roomTop">
					<span :class="[$style.status, $style[room.status]]">{{ statusLabel(room.status) }}</span>
					<span v-if="room.recordingEnabled" :class="$style.recording"><i class="ti ti-point-filled" aria-hidden="true"></i> {{ i18n.ts._voiceRooms.recordingIndicator }}</span>
				</div>
				<strong :class="$style.roomTitle">{{ room.title }}</strong>
				<p v-if="room.description" :class="$style.description">{{ room.description }}</p>
			</MkA>
		</div>
	</div>
</PageWithHeader>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import MkInput from '@/components/MkInput.vue';
import MkTextarea from '@/components/MkTextarea.vue';
import MkSwitch from '@/components/MkSwitch.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { useRouter } from '@/router.js';
import * as os from '@/os.js';

type VoiceRoom = Misskey.Endpoints['voice-rooms/list']['res'][number];

const router = useRouter();
const rooms = ref<VoiceRoom[]>([]);
const loading = ref(true);
const creating = ref(false);
const showCreate = ref(false);
const title = ref('');
const description = ref('');
const startImmediately = ref(true);
const recordingEnabled = ref(false);

const headerActions = computed(() => [{
	icon: 'ti ti-plus',
	text: i18n.ts._voiceRooms.create,
	handler: () => { showCreate.value = !showCreate.value; },
}]);

function statusLabel(status: VoiceRoom['status']): string {
	return i18n.ts._voiceRooms[status];
}

async function fetchRooms(): Promise<void> {
	loading.value = true;
	try {
		rooms.value = await misskeyApi('voice-rooms/list', {});
	} finally {
		loading.value = false;
	}
}

async function createRoom(): Promise<void> {
	creating.value = true;
	try {
		const room = await misskeyApi('voice-rooms/create', {
			title: title.value.trim(),
			description: description.value,
			startImmediately: startImmediately.value,
			recordingEnabled: recordingEnabled.value,
		});
		router.push('/voice-rooms/:roomId', { params: { roomId: room.id } });
	} catch (error) {
		await os.alert({ type: 'error', text: error instanceof Error ? error.message : String(error) });
	} finally {
		creating.value = false;
	}
}

onMounted(fetchRooms);

definePage(() => ({ title: i18n.ts._voiceRooms.title, icon: 'ti ti-broadcast' }));
</script>

<style lang="scss" module>
.form { padding: var(--MI-margin); }
.rooms { display: grid; gap: var(--MI-margin); grid-template-columns: repeat(auto-fit, minmax(min(100%, 300px), 1fr)); }
.room { display: block; min-height: 140px; padding: 20px; color: var(--MI_THEME-fg); }
.roomTop { display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.status { padding: 3px 9px; border-radius: var(--MI-radius); font-size: 12px; font-weight: 700; background: var(--MI_THEME-buttonBg); }
.live { color: var(--MI_THEME-fgOnAccent); background: var(--MI_THEME-accent); }
.scheduled { color: var(--MI_THEME-infoFg); background: var(--MI_THEME-infoBg); }
.ended { opacity: 0.7; }
.recording { color: var(--MI_THEME-error); font-size: 12px; font-weight: 700; }
.roomTitle { display: block; font-size: 20px; }
.description { margin: 10px 0 0; opacity: 0.75; line-height: 1.6; }
</style>
