/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { createWorker, type types as MediasoupTypes } from 'mediasoup';
import { IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import type { VoiceRoomParticipantsRepository, VoiceRoomsRepository } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { VoiceRoomServiceError } from '@/core/VoiceRoomService.js';
import { VoiceRoomRecordingService } from '@/core/VoiceRoomRecordingService.js';

type RoomMedia = {
	router: MediasoupTypes.Router;
	transports: Map<string, MediasoupTypes.WebRtcTransport>;
	producers: Map<string, MediasoupTypes.Producer>;
	consumers: Map<string, MediasoupTypes.Consumer>;
};

@Injectable()
export class VoiceRoomMediaService implements OnModuleDestroy {
	private worker: MediasoupTypes.Worker | null = null;
	private workerPromise: Promise<MediasoupTypes.Worker> | null = null;
	private rooms = new Map<string, RoomMedia>();
	private roomPromises = new Map<string, Promise<RoomMedia>>();

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.voiceRoomsRepository)
		private voiceRoomsRepository: VoiceRoomsRepository,

		@Inject(DI.voiceRoomParticipantsRepository)
		private voiceRoomParticipantsRepository: VoiceRoomParticipantsRepository,

		private globalEventService: GlobalEventService,
		private voiceRoomRecordingService: VoiceRoomRecordingService,
	) {
	}

	public onModuleDestroy(): void {
		this.worker?.close();
		this.worker = null;
		this.rooms.clear();
	}

	@bindThis
	private async getWorker(): Promise<MediasoupTypes.Worker> {
		if (!this.config.voiceRooms.enabled) throw new Error('Voice room media is disabled');
		if (this.worker != null) return this.worker;
		this.workerPromise ??= createWorker({
			logLevel: 'warn',
			rtcMinPort: this.config.voiceRooms.rtcMinPort,
			rtcMaxPort: this.config.voiceRooms.rtcMaxPort,
		}).then(worker => {
			this.worker = worker;
			worker.on('died', () => {
				this.worker = null;
				this.workerPromise = null;
				this.rooms.clear();
			});
			return worker;
		});
		return await this.workerPromise;
	}

	@bindThis
	private async getRoom(roomId: string): Promise<RoomMedia> {
		const current = this.rooms.get(roomId);
		if (current != null) return current;
		let pending = this.roomPromises.get(roomId);
		if (pending == null) {
			pending = (async () => {
				const room = await this.voiceRoomsRepository.findOneBy({ id: roomId, status: 'live' });
				if (room == null) throw new VoiceRoomServiceError('ROOM_NOT_LIVE');
				const worker = await this.getWorker();
				const router = await worker.createRouter({
					mediaCodecs: [{ kind: 'audio', mimeType: 'audio/opus', clockRate: 48000, channels: 2, parameters: { useinbandfec: 1, usedtx: 1 } }],
				});
				const created = { router, transports: new Map(), producers: new Map(), consumers: new Map() };
				this.rooms.set(roomId, created);
				return created;
			})();
			this.roomPromises.set(roomId, pending);
		}
		try {
			return await pending;
		} finally {
			this.roomPromises.delete(roomId);
		}
	}

	@bindThis
	private async requireParticipant(roomId: string, userId: MiUser['id']) {
		const participant = await this.voiceRoomParticipantsRepository.findOneBy({ roomId, userId, leftAt: IsNull() });
		if (participant == null) throw new VoiceRoomServiceError('PERMISSION_DENIED');
		return participant;
	}

	@bindThis
	public async getRtpCapabilities(roomId: string, userId: MiUser['id']) {
		await this.requireParticipant(roomId, userId);
		return (await this.getRoom(roomId)).router.rtpCapabilities;
	}

	@bindThis
	public async createTransport(roomId: string, userId: MiUser['id'], direction: 'send' | 'recv') {
		await this.requireParticipant(roomId, userId);
		const media = await this.getRoom(roomId);
		const listenInfo = {
			ip: this.config.voiceRooms.listenIp,
			announcedAddress: this.config.voiceRooms.announcedAddress,
			portRange: { min: this.config.voiceRooms.rtcMinPort, max: this.config.voiceRooms.rtcMaxPort },
		};
		const transport = await media.router.createWebRtcTransport({
			listenInfos: [{ protocol: 'udp', ...listenInfo }, { protocol: 'tcp', ...listenInfo }],
			enableSctp: false,
			appData: { roomId, userId, direction },
		});
		media.transports.set(transport.id, transport);
		transport.on('dtlsstatechange', state => {
			if (state === 'closed' || state === 'failed') this.closeTransport(roomId, transport.id);
		});
		transport.on('routerclose', () => media.transports.delete(transport.id));
		return { id: transport.id, iceParameters: transport.iceParameters, iceCandidates: transport.iceCandidates, dtlsParameters: transport.dtlsParameters };
	}

	@bindThis
	public async connectTransport(roomId: string, userId: MiUser['id'], transportId: string, dtlsParameters: MediasoupTypes.DtlsParameters): Promise<void> {
		await this.requireParticipant(roomId, userId);
		const transport = (await this.getRoom(roomId)).transports.get(transportId);
		if (transport == null || transport.appData.userId !== userId) throw new VoiceRoomServiceError('PERMISSION_DENIED');
		await transport.connect({ dtlsParameters });
	}

	@bindThis
	public async produce(roomId: string, userId: MiUser['id'], transportId: string, rtpParameters: MediasoupTypes.RtpParameters) {
		const participant = await this.requireParticipant(roomId, userId);
		if (participant.role === 'listener') throw new VoiceRoomServiceError('PERMISSION_DENIED');
		const media = await this.getRoom(roomId);
		const transport = media.transports.get(transportId);
		if (transport == null || transport.appData.userId !== userId || transport.appData.direction !== 'send') throw new VoiceRoomServiceError('PERMISSION_DENIED');
		for (const producer of media.producers.values()) if (producer.appData.userId === userId) producer.close();
		const producer = await transport.produce({ kind: 'audio', rtpParameters, appData: { roomId, userId } });
		media.producers.set(producer.id, producer);
		producer.observer.on('close', () => media.producers.delete(producer.id));
		void this.voiceRoomRecordingService.recordProducer(roomId, media.router, producer).catch(() => undefined);
		this.globalEventService.publishVoiceRoomStream(roomId, 'producerAdded', { producerId: producer.id, userId });
		return { id: producer.id };
	}

	@bindThis
	public async consume(roomId: string, userId: MiUser['id'], transportId: string, producerId: string, rtpCapabilities: MediasoupTypes.RtpCapabilities) {
		await this.requireParticipant(roomId, userId);
		const media = await this.getRoom(roomId);
		const transport = media.transports.get(transportId);
		if (transport == null || transport.appData.userId !== userId || transport.appData.direction !== 'recv') throw new VoiceRoomServiceError('PERMISSION_DENIED');
		if (!media.router.canConsume({ producerId, rtpCapabilities })) throw new Error('Cannot consume producer');
		const consumer = await transport.consume({ producerId, rtpCapabilities, paused: true, appData: { roomId, userId } });
		media.consumers.set(consumer.id, consumer);
		consumer.observer.on('close', () => media.consumers.delete(consumer.id));
		consumer.on('producerclose', () => {
			media.consumers.delete(consumer.id);
			this.globalEventService.publishVoiceRoomStream(roomId, 'producerClosed', { producerId });
		});
		return { id: consumer.id, producerId, kind: consumer.kind, rtpParameters: consumer.rtpParameters };
	}

	@bindThis
	public async resumeConsumer(roomId: string, userId: MiUser['id'], consumerId: string): Promise<void> {
		await this.requireParticipant(roomId, userId);
		const consumer = (await this.getRoom(roomId)).consumers.get(consumerId);
		if (consumer == null || consumer.appData.userId !== userId) throw new VoiceRoomServiceError('PERMISSION_DENIED');
		await consumer.resume();
	}

	@bindThis
	public async setMuted(roomId: string, userId: MiUser['id'], muted: boolean): Promise<void> {
		const participant = await this.requireParticipant(roomId, userId);
		if (participant.role === 'listener') throw new VoiceRoomServiceError('PERMISSION_DENIED');
		const media = await this.getRoom(roomId);
		for (const producer of media.producers.values()) {
			if (producer.appData.userId !== userId) continue;
			if (muted) await producer.pause();
			else await producer.resume();
		}
		await this.voiceRoomParticipantsRepository.update(participant.id, { isMuted: muted });
		this.globalEventService.publishVoiceRoomStream(roomId, 'participantChanged', { userId });
	}

	@bindThis
	public listProducers(roomId: string, exceptUserId?: MiUser['id']): { producerId: string; userId: string }[] {
		const media = this.rooms.get(roomId);
		if (media == null) return [];
		return [...media.producers.values()].filter(producer => producer.appData.userId !== exceptUserId).map(producer => ({ producerId: producer.id, userId: producer.appData.userId as string }));
	}

	@bindThis
	public closeUser(roomId: string, userId: MiUser['id']): void {
		const media = this.rooms.get(roomId);
		if (media == null) return;
		for (const [id, transport] of media.transports) if (transport.appData.userId === userId) this.closeTransport(roomId, id);
	}

	@bindThis
	private closeTransport(roomId: string, transportId: string): void {
		const media = this.rooms.get(roomId);
		const transport = media?.transports.get(transportId);
		if (media == null || transport == null) return;
		media.transports.delete(transportId);
		transport.close();
	}

	@bindThis
	public async closeRoom(roomId: string): Promise<void> {
		const media = this.rooms.get(roomId);
		if (media != null) {
			media.router.close();
			this.rooms.delete(roomId);
		}
		this.roomPromises.delete(roomId);
		await this.voiceRoomRecordingService.finish(roomId);
	}
}
