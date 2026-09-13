/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { VoiceRoomParticipantsRepository, VoiceRoomSpeakRequestsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { voiceRoomErrors } from './common.js';

const requestSchema = { type: 'object', optional: false, nullable: false, properties: {
	id: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
	userId: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
	createdAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
} } as const;

export const meta = {
	tags: ['voice-rooms'], requireCredential: true, kind: 'read:account', errors: voiceRoomErrors,
	res: { type: 'array', optional: false, nullable: false, items: requestSchema },
} as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } }, required: ['roomId'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.voiceRoomParticipantsRepository)
		participantsRepository: VoiceRoomParticipantsRepository,
		@Inject(DI.voiceRoomSpeakRequestsRepository)
		requestsRepository: VoiceRoomSpeakRequestsRepository,
	) {
		super(meta, paramDef, async (ps, me) => {
			const actor = await participantsRepository.findOneBy({ roomId: ps.roomId, userId: me.id, leftAt: IsNull() });
			if (actor == null || actor.role !== 'host' && actor.role !== 'cohost') throw new ApiError(voiceRoomErrors.permissionDenied);
			const requests = await requestsRepository.find({ where: { roomId: ps.roomId, status: 'pending' }, order: { createdAt: 'ASC' } });
			return requests.map(request => ({ id: request.id, userId: request.userId, createdAt: request.createdAt.toISOString() }));
		});
	}
}
