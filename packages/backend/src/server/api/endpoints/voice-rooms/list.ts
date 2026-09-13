/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { DI } from '@/di-symbols.js';
import type { VoiceRoomsRepository } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { serializeVoiceRoom, voiceRoomSchema } from './common.js';

export const meta = {
	tags: ['voice-rooms'],
	requireCredential: true,
	kind: 'read:account',
	res: { type: 'array', optional: false, nullable: false, items: voiceRoomSchema },
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		status: { type: 'string', enum: ['scheduled', 'live', 'ended'] },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
	},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.voiceRoomsRepository)
		private voiceRoomsRepository: VoiceRoomsRepository,
	) {
		super(meta, paramDef, async ps => {
			const rooms = await this.voiceRoomsRepository.find({
				where: ps.status == null ? { status: In(['scheduled', 'live']) } : { status: ps.status },
				order: { status: 'ASC', scheduledAt: 'ASC', createdAt: 'DESC' },
				take: ps.limit,
			});
			return rooms.map(serializeVoiceRoom);
		});
	}
}
