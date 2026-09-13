/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { VoiceRoomService } from '@/core/VoiceRoomService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { serializeVoiceRoom, voiceRoomErrors, voiceRoomSchema } from './common.js';

export const meta = {
	tags: ['voice-rooms'],
	requireCredential: true,
	kind: 'write:account',
	limit: { duration: 1000 * 60 * 60, max: 10 },
	errors: voiceRoomErrors,
	res: voiceRoomSchema,
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		title: { type: 'string', minLength: 1, maxLength: 256 },
		description: { type: 'string', maxLength: 2048, default: '' },
		scheduledAt: { type: 'string', nullable: true, default: null },
		startImmediately: { type: 'boolean', default: false },
		recordingEnabled: { type: 'boolean', default: false },
	},
	required: ['title'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private voiceRoomService: VoiceRoomService) {
		super(meta, paramDef, async (ps, me) => {
			if (ps.scheduledAt != null && isNaN(Date.parse(ps.scheduledAt))) throw new ApiError(voiceRoomErrors.invalidScheduledAt);
			return serializeVoiceRoom(await this.voiceRoomService.create(me, {
				title: ps.title.trim(),
				description: ps.description,
				scheduledAt: ps.scheduledAt == null ? null : new Date(ps.scheduledAt),
				startImmediately: ps.startImmediately,
				recordingEnabled: ps.recordingEnabled,
			}));
		});
	}
}
