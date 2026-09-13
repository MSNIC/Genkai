/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { VoiceRoomService } from '@/core/VoiceRoomService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { throwVoiceRoomApiError, voiceRoomErrors } from './common.js';

const requestSchema = { type: 'object', optional: false, nullable: false, properties: {
	id: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
	roomId: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
	userId: { type: 'string', format: 'misskey:id', optional: false, nullable: false },
	status: { type: 'string', enum: ['pending', 'accepted', 'rejected', 'withdrawn'], optional: false, nullable: false },
} } as const;

export const meta = { tags: ['voice-rooms'], requireCredential: true, kind: 'write:account', errors: voiceRoomErrors, res: requestSchema } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } }, required: ['roomId'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private voiceRoomService: VoiceRoomService, private globalEventService: GlobalEventService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const request = await this.voiceRoomService.requestToSpeak(ps.roomId, me.id);
				this.globalEventService.publishVoiceRoomStream(ps.roomId, 'speakRequestsChanged', {});
				return { id: request.id, roomId: request.roomId, userId: request.userId, status: request.status };
			} catch (error) { throwVoiceRoomApiError(error); }
		});
	}
}
