/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { IsNull } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { VoiceRoomParticipantsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';

const participantSchema = { type: 'object', optional: false, nullable: false, properties: {
	id: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
	userId: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
	role: { type: 'string', enum: ['host', 'cohost', 'speaker', 'listener'], optional: false, nullable: false },
	isMuted: { type: 'boolean', optional: false, nullable: false },
	joinedAt: { type: 'string', format: 'date-time', optional: false, nullable: false },
} } as const;

export const meta = {
	tags: ['voice-rooms'], requireCredential: true, kind: 'read:account',
	res: { type: 'array', optional: false, nullable: false, items: participantSchema },
} as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } }, required: ['roomId'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.voiceRoomParticipantsRepository)
		participantsRepository: VoiceRoomParticipantsRepository,
	) {
		super(meta, paramDef, async (ps) => {
			const participants = await participantsRepository.find({ where: { roomId: ps.roomId, leftAt: IsNull() }, order: { joinedAt: 'ASC' } });
			return participants.map(participant => ({ id: participant.id, userId: participant.userId, role: participant.role, isMuted: participant.isMuted, joinedAt: participant.joinedAt.toISOString() }));
		});
	}
}
