/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { VoiceRoomService } from '@/core/VoiceRoomService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { ApiError } from '@/server/api/error.js';
import { serializeVoiceRoom, voiceRoomErrors, voiceRoomSchema } from './common.js';

export const meta = { tags: ['voice-rooms'], requireCredential: true, kind: 'read:account', errors: voiceRoomErrors, res: voiceRoomSchema } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } }, required: ['roomId'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private voiceRoomService: VoiceRoomService) {
		super(meta, paramDef, async ps => {
			const room = await this.voiceRoomService.get(ps.roomId);
			if (room == null) throw new ApiError(meta.errors.roomNotFound);
			return serializeVoiceRoom(room);
		});
	}
}
