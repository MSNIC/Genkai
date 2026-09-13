/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DataSource, IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import {
	MiVoiceRoom,
	MiVoiceRoomParticipant,
	MiVoiceRoomSpeakRequest,
	type VoiceRoomParticipantsRepository,
	type VoiceRoomsRepository,
} from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import type { Config } from '@/config.js';

export type VoiceRoomServiceErrorCode =
	| 'ROOM_NOT_FOUND'
	| 'ROOM_NOT_LIVE'
	| 'PERMISSION_DENIED'
	| 'ROOM_FULL'
	| 'SPEAKER_LIMIT_REACHED'
	| 'NOT_A_LISTENER'
	| 'REQUEST_NOT_FOUND'
	| 'FEATURE_DISABLED'
	| 'INVALID_TITLE';

export class VoiceRoomServiceError extends Error {
	constructor(public readonly code: VoiceRoomServiceErrorCode) {
		super(code);
	}
}

@Injectable()
export class VoiceRoomService {
	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.db)
		private db: DataSource,

		@Inject(DI.voiceRoomsRepository)
		private voiceRoomsRepository: VoiceRoomsRepository,

		@Inject(DI.voiceRoomParticipantsRepository)
		private voiceRoomParticipantsRepository: VoiceRoomParticipantsRepository,

		private idService: IdService,
	) {
	}

	@bindThis
	public async create(host: MiUser, params: {
		title: string;
		description: string;
		scheduledAt: Date | null;
		startImmediately: boolean;
		recordingEnabled: boolean;
	}): Promise<MiVoiceRoom> {
		if (!this.config.voiceRooms.enabled) throw new VoiceRoomServiceError('FEATURE_DISABLED');
		if (params.title.trim() === '') throw new VoiceRoomServiceError('INVALID_TITLE');
		return await this.db.transaction(async transaction => {
			const now = new Date();
			const room = await transaction.getRepository(MiVoiceRoom).save({
				id: this.idService.gen(now.getTime()),
				hostId: host.id,
				title: params.title,
				description: params.description,
				status: params.startImmediately ? 'live' : 'scheduled',
				createdAt: now,
				scheduledAt: params.scheduledAt,
				startedAt: params.startImmediately ? now : null,
				endedAt: null,
				maxSpeakers: 6,
				maxListeners: 100,
				recordingEnabled: params.recordingEnabled,
			});

			await transaction.insert(MiVoiceRoomParticipant, {
				id: this.idService.gen(),
				roomId: room.id,
				userId: host.id,
				role: 'host',
				joinedAt: now,
				leftAt: null,
				isMuted: false,
			});

			return room;
		});
	}

	@bindThis
	public async start(roomId: string, userId: MiUser['id']): Promise<MiVoiceRoom> {
		if (!this.config.voiceRooms.enabled) throw new VoiceRoomServiceError('FEATURE_DISABLED');
		return await this.db.transaction(async transaction => {
			const room = await transaction.findOne(MiVoiceRoom, {
				where: { id: roomId },
				lock: { mode: 'pessimistic_write' },
			});
			if (room == null) throw new VoiceRoomServiceError('ROOM_NOT_FOUND');
			if (room.hostId !== userId) throw new VoiceRoomServiceError('PERMISSION_DENIED');
			if (room.status === 'ended') throw new VoiceRoomServiceError('ROOM_NOT_LIVE');
			if (room.status === 'live') return room;

			room.status = 'live';
			room.startedAt = new Date();
			return await transaction.save(room);
		});
	}

	@bindThis
	public async end(roomId: string, userId: MiUser['id']): Promise<MiVoiceRoom> {
		return await this.db.transaction(async transaction => {
			const room = await transaction.findOne(MiVoiceRoom, {
				where: { id: roomId },
				lock: { mode: 'pessimistic_write' },
			});
			if (room == null) throw new VoiceRoomServiceError('ROOM_NOT_FOUND');
			const actor = await transaction.findOneBy(MiVoiceRoomParticipant, { roomId, userId, leftAt: IsNull() });
			if (actor == null || actor.role !== 'host' && actor.role !== 'cohost') {
				throw new VoiceRoomServiceError('PERMISSION_DENIED');
			}
			if (room.status === 'ended') return room;

			const now = new Date();
			room.status = 'ended';
			room.endedAt = now;
			await transaction.update(MiVoiceRoomParticipant, { roomId, leftAt: IsNull() }, { leftAt: now, isMuted: true });
			return await transaction.save(room);
		});
	}

	@bindThis
	public async join(roomId: string, userId: MiUser['id']): Promise<MiVoiceRoomParticipant> {
		if (!this.config.voiceRooms.enabled) throw new VoiceRoomServiceError('FEATURE_DISABLED');
		return await this.db.transaction(async transaction => {
			const room = await transaction.findOne(MiVoiceRoom, {
				where: { id: roomId },
				lock: { mode: 'pessimistic_write' },
			});
			if (room == null) throw new VoiceRoomServiceError('ROOM_NOT_FOUND');
			if (room.status !== 'live') throw new VoiceRoomServiceError('ROOM_NOT_LIVE');

			const existing = await transaction.findOneBy(MiVoiceRoomParticipant, { roomId, userId });
			if (existing != null && existing.leftAt == null) return existing;
			const activeCount = await transaction.countBy(MiVoiceRoomParticipant, { roomId, leftAt: IsNull() });
			if (activeCount >= room.maxListeners + room.maxSpeakers) throw new VoiceRoomServiceError('ROOM_FULL');

			if (existing != null) {
				existing.role = existing.role === 'host' || existing.role === 'cohost' ? existing.role : 'listener';
				existing.joinedAt = new Date();
				existing.leftAt = null;
				existing.isMuted = true;
				return await transaction.save(existing);
			}

			return await transaction.getRepository(MiVoiceRoomParticipant).save({
				id: this.idService.gen(),
				roomId,
				userId,
				role: 'listener',
				joinedAt: new Date(),
				leftAt: null,
				isMuted: true,
			});
		});
	}

	@bindThis
	public async leave(roomId: string, userId: MiUser['id']): Promise<'ended' | 'left'> {
		const participant = await this.voiceRoomParticipantsRepository.findOneBy({ roomId, userId, leftAt: IsNull() });
		if (participant == null) throw new VoiceRoomServiceError('ROOM_NOT_FOUND');
		if (participant.role === 'host') {
			await this.end(roomId, userId);
			return 'ended';
		}
		await this.voiceRoomParticipantsRepository.update(participant.id, { leftAt: new Date(), isMuted: true });
		return 'left';
	}

	@bindThis
	public async requestToSpeak(roomId: string, userId: MiUser['id']): Promise<MiVoiceRoomSpeakRequest> {
		return await this.db.transaction(async transaction => {
			const room = await transaction.findOne(MiVoiceRoom, {
				where: { id: roomId },
				lock: { mode: 'pessimistic_write' },
			});
			if (room == null) throw new VoiceRoomServiceError('ROOM_NOT_FOUND');
			if (room.status !== 'live') throw new VoiceRoomServiceError('ROOM_NOT_LIVE');
			const participant = await transaction.findOneBy(MiVoiceRoomParticipant, { roomId, userId, leftAt: IsNull() });
			if (participant?.role !== 'listener') throw new VoiceRoomServiceError('NOT_A_LISTENER');

			const current = await transaction.findOneBy(MiVoiceRoomSpeakRequest, { roomId, userId, status: 'pending' });
			if (current != null) return current;
			return await transaction.getRepository(MiVoiceRoomSpeakRequest).save({
				id: this.idService.gen(),
				roomId,
				userId,
				status: 'pending',
				createdAt: new Date(),
				respondedAt: null,
				respondedById: null,
			});
		});
	}

	@bindThis
	public async respondToSpeakRequest(requestId: string, actorId: MiUser['id'], accept: boolean): Promise<MiVoiceRoomSpeakRequest> {
		return await this.db.transaction(async transaction => {
			const request = await transaction.findOne(MiVoiceRoomSpeakRequest, {
				where: { id: requestId },
				lock: { mode: 'pessimistic_write' },
			});
			if (request == null || request.status !== 'pending') throw new VoiceRoomServiceError('REQUEST_NOT_FOUND');
			const actor = await transaction.findOneBy(MiVoiceRoomParticipant, { roomId: request.roomId, userId: actorId, leftAt: IsNull() });
			if (actor == null || actor.role !== 'host' && actor.role !== 'cohost') {
				throw new VoiceRoomServiceError('PERMISSION_DENIED');
			}

			if (accept) {
				const room = await transaction.findOneOrFail(MiVoiceRoom, {
					where: { id: request.roomId },
					lock: { mode: 'pessimistic_write' },
				});
				const speakerCount = await transaction.count(MiVoiceRoomParticipant, {
					where: [
						{ roomId: request.roomId, role: 'host', leftAt: IsNull() },
						{ roomId: request.roomId, role: 'cohost', leftAt: IsNull() },
						{ roomId: request.roomId, role: 'speaker', leftAt: IsNull() },
					],
				});
				if (speakerCount >= room.maxSpeakers) throw new VoiceRoomServiceError('SPEAKER_LIMIT_REACHED');
				await transaction.update(MiVoiceRoomParticipant, {
					roomId: request.roomId,
					userId: request.userId,
					leftAt: IsNull(),
				}, { role: 'speaker', isMuted: true });
			}

			request.status = accept ? 'accepted' : 'rejected';
			request.respondedAt = new Date();
			request.respondedById = actorId;
			return await transaction.save(request);
		});
	}

	@bindThis
	public async get(roomId: string): Promise<MiVoiceRoom | null> {
		return await this.voiceRoomsRepository.findOneBy({ id: roomId });
	}
}
