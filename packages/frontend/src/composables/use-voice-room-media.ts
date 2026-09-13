/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { onUnmounted, ref, shallowRef } from 'vue';
import { Device } from 'mediasoup-client';
import type { types as MediasoupTypes } from 'mediasoup-client';
import type * as Misskey from 'misskey-js';
import { useStream } from '@/stream.js';

type VoiceRoomConnection = Misskey.IChannelConnection<Misskey.Channels['voiceRoom']>;
type ProducerInfo = { producerId: string; userId: string };

export function useVoiceRoomMedia() {
	const connection = shallowRef<VoiceRoomConnection | null>(null);
	const producer = shallowRef<MediasoupTypes.Producer | null>(null);
	const connected = ref(false);
	const muted = ref(true);
	const playbackBlocked = ref(false);
	const consumers = new Map<string, MediasoupTypes.Consumer>();
	const consuming = new Set<string>();
	const audioElements = new Map<string, HTMLAudioElement>();
	let device: Device | null = null;
	let sendTransport: MediasoupTypes.Transport | null = null;
	let receiveTransport: MediasoupTypes.Transport | null = null;
	let requestSequence = 0;

	function request<T>(type: keyof Misskey.Channels['voiceRoom']['receives'], body: Record<string, unknown> = {}): Promise<T> {
		const current = connection.value;
		if (current == null) return Promise.reject(new Error('Voice room channel is not connected'));
		const requestId = `${Date.now()}-${++requestSequence}`;
		return new Promise<T>((resolve, reject) => {
			const timeout = window.setTimeout(() => {
				current.off('response', onResponse);
				reject(new Error('Voice room request timed out'));
			}, 15000);
			const onResponse = (response: { requestId: string; ok: boolean; data?: unknown; error?: string }) => {
				if (response.requestId !== requestId) return;
				window.clearTimeout(timeout);
				current.off('response', onResponse);
				if (response.ok) resolve(response.data as T);
				else reject(new Error(response.error ?? 'Voice room request failed'));
			};
			current.on('response', onResponse);
			current.send(type as never, { requestId, ...body } as never);
		});
	}

	async function createReceiveTransport(): Promise<void> {
		if (device == null) throw new Error('Voice room device is not loaded');
		const options = await request<MediasoupTypes.TransportOptions>('createTransport', { direction: 'recv' });
		const transport = device.createRecvTransport(options);
		receiveTransport = transport;
		transport.on('connect', ({ dtlsParameters }, callback, errback) => {
			request('connectTransport', { transportId: transport.id, dtlsParameters: dtlsParameters as unknown as Record<string, unknown> }).then(callback).catch(errback);
		});
	}

	async function enableMicrophone(): Promise<void> {
		if (producer.value != null || connection.value == null || device == null) return;
		const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
		const options = await request<MediasoupTypes.TransportOptions>('createTransport', { direction: 'send' });
		const transport = device.createSendTransport(options);
		sendTransport = transport;
		transport.on('connect', ({ dtlsParameters }, callback, errback) => {
			request('connectTransport', { transportId: transport.id, dtlsParameters: dtlsParameters as unknown as Record<string, unknown> }).then(callback).catch(errback);
		});
		transport.on('produce', ({ rtpParameters }, callback, errback) => {
			request<{ id: string }>('produce', { transportId: transport.id, rtpParameters: rtpParameters as unknown as Record<string, unknown> }).then(callback).catch(errback);
		});
		producer.value = await transport.produce({ track: stream.getAudioTracks()[0] });
		producer.value.pause();
		if (producer.value.track != null) producer.value.track.enabled = false;
		muted.value = true;
		try {
			await request('setMuted', { muted: true });
		} catch (error) {
			producer.value.track?.stop();
			producer.value.close();
			producer.value = null;
			transport.close();
			sendTransport = null;
			throw error;
		}
	}

	async function consume(info: ProducerInfo): Promise<void> {
		if (device == null || receiveTransport == null || consumers.has(info.producerId) || consuming.has(info.producerId)) return;
		consuming.add(info.producerId);
		try {
			const options = await request<MediasoupTypes.ConsumerOptions>('consume', {
				transportId: receiveTransport.id,
				producerId: info.producerId,
				rtpCapabilities: device.rtpCapabilities as unknown as Record<string, unknown>,
			});
			const consumer = await receiveTransport.consume(options);
			consumers.set(info.producerId, consumer);
			const audio = new Audio();
			audio.autoplay = true;
			audio.srcObject = new MediaStream([consumer.track]);
			audioElements.set(info.producerId, audio);
			await request('resumeConsumer', { consumerId: consumer.id });
			await audio.play().catch(() => { playbackBlocked.value = true; });
		} finally {
			consuming.delete(info.producerId);
		}
	}

	function closeConsumer(producerId: string): void {
		consumers.get(producerId)?.close();
		consumers.delete(producerId);
		const audio = audioElements.get(producerId);
		if (audio != null) audio.srcObject = null;
		audioElements.delete(producerId);
	}

	async function connect(roomId: string, canSpeak: boolean): Promise<void> {
		disconnect();
		connection.value = useStream().useChannel('voiceRoom', { roomId });
		connection.value.on('producerAdded', info => void consume(info));
		connection.value.on('producerClosed', info => closeConsumer(info.producerId));
		await new Promise<void>((resolve, reject) => {
			const current = connection.value;
			if (current == null) {
				reject(new Error('Voice room channel is not connected'));
				return;
			}
			const timeout = window.setTimeout(() => {
				current.off('ready', onReady);
				reject(new Error('Voice room channel initialization timed out'));
			}, 15000);
			const onReady = () => {
				window.clearTimeout(timeout);
				current.off('ready', onReady);
				resolve();
			};
			current.on('ready', onReady);
		});
		const routerRtpCapabilities = await request<MediasoupTypes.RtpCapabilities>('getRtpCapabilities');
		device = new Device();
		await device.load({ routerRtpCapabilities });
		await createReceiveTransport();
		const existing = await request<ProducerInfo[]>('listProducers');
		await Promise.all(existing.map(consume));
		if (canSpeak) await enableMicrophone();
		connected.value = true;
	}

	async function toggleMute(): Promise<void> {
		const current = producer.value;
		if (current == null) return;
		muted.value = !muted.value;
		if (current.track != null) current.track.enabled = !muted.value;
		if (muted.value) current.pause();
		else current.resume();
		try {
			await request('setMuted', { muted: muted.value });
		} catch (error) {
			muted.value = !muted.value;
			if (current.track != null) current.track.enabled = !muted.value;
			if (muted.value) current.pause();
			else current.resume();
			throw error;
		}
	}

	async function resumePlayback(): Promise<void> {
		const results = await Promise.allSettled([...audioElements.values()].map(audio => audio.play()));
		playbackBlocked.value = results.some(result => result.status === 'rejected');
	}

	function disconnect(): void {
		producer.value?.track?.stop();
		producer.value?.close();
		producer.value = null;
		sendTransport?.close();
		receiveTransport?.close();
		sendTransport = null;
		receiveTransport = null;
		for (const producerId of consumers.keys()) closeConsumer(producerId);
		connection.value?.dispose();
		connection.value = null;
		device = null;
		connected.value = false;
		muted.value = true;
		playbackBlocked.value = false;
	}

	onUnmounted(disconnect);

	return { connection, connected, muted, playbackBlocked, producer, connect, disconnect, enableMicrophone, toggleMute, resumePlayback };
}
