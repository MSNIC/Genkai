/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { VoiceRoomService } from '@/core/VoiceRoomService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { serializeVoiceRoom, throwVoiceRoomApiError, voiceRoomErrors, voiceRoomSchema } from './common.js';

export const meta = { tags: ['voice-rooms'], requireCredential: true, kind: 'write:account', errors: voiceRoomErrors, res: voiceRoomSchema } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } }, required: ['roomId'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private voiceRoomService: VoiceRoomService, private globalEventService: GlobalEventService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const room = await this.voiceRoomService.start(ps.roomId, me.id);
				this.globalEventService.publishVoiceRoomStream(room.id, 'roomStarted', { startedAt: room.startedAt!.toISOString() });
				return serializeVoiceRoom(room);
			} catch (error) { throwVoiceRoomApiError(error); }
		});
	}
}
