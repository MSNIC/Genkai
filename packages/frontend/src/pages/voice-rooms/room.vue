<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader>
	<div class="_spacer" style="--MI_SPACER-w: 900px;">
		<MkLoading v-if="room == null"/>
		<div v-else class="_gaps">
			<section :class="$style.stage" class="_panel">
				<div :class="$style.stageHeader">
					<div>
						<div :class="$style.liveLine"><span :class="$style.liveDot"></span>{{ i18n.ts._voiceRooms[room.status] }}</div>
						<h2 :class="$style.title">{{ room.title }}</h2>
						<p v-if="room.description" :class="$style.description">{{ room.description }}</p>
					</div>
					<div v-if="room.recordingEnabled" :class="$style.recording"><i class="ti ti-point-filled"></i> {{ i18n.ts._voiceRooms.recordingNotice }}</div>
				</div>

				<h3 :class="$style.sectionTitle">{{ i18n.ts._voiceRooms.speakers }}</h3>
				<div :class="$style.people">
					<div v-for="participant in speakers" :key="participant.id" :class="$style.person">
						<MkAvatar v-if="users[participant.userId]" :user="users[participant.userId]" :class="$style.avatar"/>
						<div v-else :class="$style.avatarPlaceholder"><i class="ti ti-user"></i></div>
						<strong>{{ users[participant.userId]?.name ?? users[participant.userId]?.username ?? participant.userId }}</strong>
						<span :class="$style.role">{{ i18n.ts._voiceRooms[participant.role] }}</span>
						<i v-if="participant.isMuted" class="ti ti-microphone-off" :class="$style.mutedIcon" role="img" :aria-label="i18n.ts._voiceRooms.mute"></i>
					</div>
				</div>

				<div :class="$style.controls">
					<MkButton v-if="media.playbackBlocked.value" primary @click="media.resumePlayback"><i class="ti ti-player-play"></i> {{ i18n.ts._voiceRooms.playAudio }}</MkButton>
					<MkButton v-if="room.status === 'scheduled' && isHost" primary @click="startRoom"><i class="ti ti-player-play"></i> {{ i18n.ts._voiceRooms.start }}</MkButton>
					<MkButton v-else-if="room.status === 'live' && !joined" primary @click="joinRoom"><i class="ti ti-headphones"></i> {{ i18n.ts._voiceRooms.join }}</MkButton>
					<template v-else-if="joined">
						<MkButton v-if="canSpeak" :primary="muted" @click="toggleMute"><i :class="muted ? 'ti ti-microphone' : 'ti ti-microphone-off'"></i> {{ muted ? i18n.ts._voiceRooms.unmute : i18n.ts._voiceRooms.mute }}</MkButton>
						<MkButton v-else-if="!speakRequested" @click="requestToSpeak"><i class="ti ti-hand-stop"></i> {{ i18n.ts._voiceRooms.requestToSpeak }}</MkButton>
						<MkButton danger @click="leaveRoom"><i class="ti ti-phone-off"></i> {{ isHost ? i18n.ts._voiceRooms.end : i18n.ts._voiceRooms.leave }}</MkButton>
					</template>
				</div>
			</section>

			<section v-if="isModerator && requests.length > 0" class="_panel" :class="$style.panel">
				<h3 :class="$style.sectionTitle">{{ i18n.ts._voiceRooms.requests }}</h3>
				<div v-for="request in requests" :key="request.id" :class="$style.request">
					<span>{{ users[request.userId]?.name ?? users[request.userId]?.username ?? request.userId }}</span>
					<MkButton small primary @click="respond(request.id, true)">{{ i18n.ts._voiceRooms.approve }}</MkButton>
					<MkButton small @click="respond(request.id, false)">{{ i18n.ts._voiceRooms.reject }}</MkButton>
				</div>
			</section>

			<section v-if="isHost && recordings.length > 0" class="_panel" :class="$style.panel">
				<h3 :class="$style.sectionTitle">{{ i18n.ts._voiceRooms.recordings }}</h3>
				<div v-for="recording in recordings" :key="recording.id">
					<audio v-if="recording.fileId != null && recordingFiles[recording.fileId]" controls :class="$style.audio" :aria-label="i18n.ts._voiceRooms.recordingPlayer" :src="recordingFiles[recording.fileId].url"></audio>
					<span v-else-if="recording.status === 'failed'">{{ i18n.ts._voiceRooms.recordingFailed }}</span>
					<span v-else>{{ i18n.ts._voiceRooms.recordingProcessing }}</span>
				</div>
			</section>

			<section class="_panel" :class="$style.panel">
				<h3 :class="$style.sectionTitle">{{ i18n.ts._voiceRooms.listeners }} ({{ listeners.length }})</h3>
				<div :class="$style.listenerList">
					<span v-for="participant in listeners" :key="participant.id" :class="$style.listener">
						<MkAvatar v-if="users[participant.userId]" :user="users[participant.userId]" :class="$style.listenerAvatar"/>
						{{ users[participant.userId]?.name ?? users[participant.userId]?.username ?? participant.userId }}
					</span>
				</div>
			</section>
		</div>
	</div>
</PageWithHeader>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkButton from '@/components/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { useRouter } from '@/router.js';
import { useVoiceRoomMedia } from '@/composables/use-voice-room-media.js';
import { useInterval } from '@@/js/use-interval.js';
import * as os from '@/os.js';

type VoiceRoom = Misskey.Endpoints['voice-rooms/show']['res'];
type Participant = Misskey.Endpoints['voice-rooms/list-participants']['res'][number];
type SpeakRequest = Misskey.Endpoints['voice-rooms/list-speak-requests']['res'][number];
type Recording = Misskey.Endpoints['voice-rooms/list-recordings']['res'][number];

const props = defineProps<{ roomId: string }>();
const router = useRouter();
const room = shallowRef<VoiceRoom | null>(null);
const participants = ref<Participant[]>([]);
const requests = ref<SpeakRequest[]>([]);
const recordings = ref<Recording[]>([]);
const recordingFiles = shallowRef<Record<string, Misskey.entities.DriveFile>>({});
const users = shallowRef<Record<string, Misskey.entities.UserLite>>({});
const joined = ref(false);
const speakRequested = ref(false);
let requestsInitialized = false;
let requestsFetching = false;
let microphoneAttempted = false;
const media = useVoiceRoomMedia();
const { muted } = media;

const me = computed(() => participants.value.find(participant => participant.userId === $i?.id));
const isHost = computed(() => room.value?.hostId === $i?.id);
const isModerator = computed(() => me.value?.role === 'host' || me.value?.role === 'cohost');
const canSpeak = computed(() => me.value != null && me.value.role !== 'listener');
const speakers = computed(() => participants.value.filter(participant => participant.role !== 'listener'));
const listeners = computed(() => participants.value.filter(participant => participant.role === 'listener'));

async function loadUsers(): Promise<void> {
	const missing = [...new Set([...participants.value.map(x => x.userId), ...requests.value.map(x => x.userId)])].filter(id => users.value[id] == null);
	const loaded = await Promise.all(missing.map(userId => misskeyApi('users/show', { userId }).catch(() => null)));
	const next = { ...users.value };
	for (const user of loaded) if (user != null) next[user.id] = user;
	users.value = next;
}

async function fetchParticipants(): Promise<void> {
	participants.value = await misskeyApi('voice-rooms/list-participants', { roomId: props.roomId });
	await loadUsers();
	if (joined.value && canSpeak.value) await tryEnableMicrophone();
}

async function tryEnableMicrophone(): Promise<void> {
	if (!media.connected.value || media.producer.value != null || microphoneAttempted) return;
	microphoneAttempted = true;
	await media.enableMicrophone().catch(showMicrophoneError);
}

async function fetchRequests(notify = false): Promise<void> {
	if (!isModerator.value || requestsFetching) return;
	requestsFetching = true;
	try {
		const previousIds = new Set(requests.value.map(request => request.id));
		const nextRequests = await misskeyApi('voice-rooms/list-speak-requests', { roomId: props.roomId });
		const hasNewRequest = requestsInitialized && nextRequests.some(request => !previousIds.has(request.id));
		requests.value = nextRequests;
		await loadUsers();
		if (notify && hasNewRequest) os.toast(i18n.ts._voiceRooms.newSpeakRequest);
		requestsInitialized = true;
	} finally {
		requestsFetching = false;
	}
}

async function fetchRecordings(): Promise<void> {
	if (!isHost.value) return;
	recordings.value = await misskeyApi('voice-rooms/list-recordings', { roomId: props.roomId });
	const fileIds = recordings.value.flatMap(recording => recording.fileId == null ? [] : [recording.fileId]);
	const files = await Promise.all(fileIds.map(fileId => misskeyApi('drive/files/show', { fileId }).catch(() => null)));
	recordingFiles.value = Object.fromEntries(files.filter(file => file != null).map(file => [file.id, file]));
}

function bindEvents(): void {
	media.connection.value?.on('participantChanged', () => void fetchParticipants());
	media.connection.value?.on('speakRequestsChanged', () => void fetchRequests(true));
	media.connection.value?.on('roomStarted', payload => {
		if (room.value != null) { room.value.status = 'live'; room.value.startedAt = payload.startedAt; }
	});
	media.connection.value?.on('roomEnded', payload => {
		if (room.value != null) { room.value.status = 'ended'; room.value.endedAt = payload.endedAt; }
		joined.value = false;
		media.disconnect();
	});
}

async function joinRoom(): Promise<void> {
	const wasParticipant = me.value != null;
	microphoneAttempted = false;
	try {
		await misskeyApi('voice-rooms/join', { roomId: props.roomId });
		joined.value = true;
		await fetchParticipants();
		await media.connect(props.roomId, false);
		bindEvents();
		if (canSpeak.value) await tryEnableMicrophone();
		await fetchRequests();
	} catch (error) {
		if (!wasParticipant && !isHost.value) await misskeyApi('voice-rooms/leave', { roomId: props.roomId }).catch(() => undefined);
		joined.value = false;
		media.disconnect();
		await os.alert({ type: 'error', text: i18n.ts._voiceRooms.connectionError });
	}
}

async function startRoom(): Promise<void> {
	room.value = await misskeyApi('voice-rooms/start', { roomId: props.roomId });
	await joinRoom();
}

async function leaveRoom(): Promise<void> {
	if (isHost.value) await misskeyApi('voice-rooms/end', { roomId: props.roomId });
	else await misskeyApi('voice-rooms/leave', { roomId: props.roomId });
	joined.value = false;
	media.disconnect();
	router.push('/voice-rooms');
}

async function requestToSpeak(): Promise<void> {
	await misskeyApi('voice-rooms/request-to-speak', { roomId: props.roomId });
	speakRequested.value = true;
	await os.alert({ type: 'info', text: i18n.ts._voiceRooms.requestedToSpeak });
}

async function respond(requestId: string, accept: boolean): Promise<void> {
	await misskeyApi('voice-rooms/respond-to-speak-request', { requestId, accept });
	await Promise.all([fetchParticipants(), fetchRequests()]);
}

async function toggleMute(): Promise<void> {
	if (media.producer.value == null) {
		microphoneAttempted = false;
		await tryEnableMicrophone();
	}
	if (media.producer.value != null) await media.toggleMute();
}

function showMicrophoneError(): void { void os.alert({ type: 'error', text: i18n.ts._voiceRooms.microphoneError }); }

onMounted(async () => {
	room.value = await misskeyApi('voice-rooms/show', { roomId: props.roomId });
	await fetchParticipants();
	await fetchRequests();
	await fetchRecordings();
});

useInterval(() => fetchRequests(true), 5000, {
	immediate: false,
	afterMounted: true,
});

onUnmounted(() => {
	if (!joined.value) return;
	const endpoint = isHost.value ? 'voice-rooms/end' : 'voice-rooms/leave';
	void misskeyApi(endpoint, { roomId: props.roomId });
});

definePage(() => ({ title: room.value?.title ?? i18n.ts._voiceRooms.title, icon: 'ti ti-broadcast' }));
</script>

<style lang="scss" module>
.stage { overflow: hidden; }
.stageHeader { display: flex; justify-content: space-between; gap: 20px; padding: 28px; border-bottom: solid 1px var(--MI_THEME-divider); }
.liveLine { display: flex; align-items: center; gap: 7px; color: var(--MI_THEME-accent); font-size: 12px; font-weight: 700; text-transform: uppercase; }
.liveDot { width: 8px; height: 8px; border-radius: 50%; background: var(--MI_THEME-accent); }
.title { margin: 8px 0 0; font-size: 26px; letter-spacing: 0; }
.description { margin: 10px 0 0; opacity: 0.75; line-height: 1.6; }
.recording { align-self: flex-start; color: var(--MI_THEME-error); font-size: 12px; font-weight: 700; }
.sectionTitle { margin: 0 0 16px; font-size: 15px; letter-spacing: 0; }
.people { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 20px; padding: 28px; }
.person { position: relative; display: flex; min-width: 0; align-items: center; flex-direction: column; gap: 7px; text-align: center; }
.avatar, .avatarPlaceholder { width: 72px; height: 72px; border-radius: 50%; }
.avatarPlaceholder { display: grid; place-items: center; background: var(--MI_THEME-buttonBg); font-size: 28px; }
.role { opacity: 0.65; font-size: 12px; }
.mutedIcon { position: absolute; top: 52px; right: calc(50% - 40px); display: grid; place-items: center; width: 24px; height: 24px; border-radius: 50%; color: var(--MI_THEME-fgOnAccent); background: var(--MI_THEME-accent); }
.controls { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; padding: 20px 28px 28px; }
.panel { padding: 22px; }
.request { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 10px; padding: 8px 0; }
.listenerList { display: flex; flex-wrap: wrap; gap: 10px; }
.listener { display: flex; align-items: center; gap: 7px; min-width: 0; padding: 6px 10px; border-radius: var(--MI-radius); background: var(--MI_THEME-buttonBg); }
.listenerAvatar { width: 24px; height: 24px; }
.audio { display: block; width: 100%; max-width: 100%; }
@media (max-width: 500px) { .stageHeader { flex-direction: column; padding: 20px; } .people { padding: 20px; grid-template-columns: repeat(2, 1fr); } .request { grid-template-columns: 1fr auto; } .request > :last-child { grid-column: 2; } }
</style>
