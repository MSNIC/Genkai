/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { VoiceRoomService } from '@/core/VoiceRoomService.js';
import { VoiceRoomMediaService } from '@/core/VoiceRoomMediaService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { throwVoiceRoomApiError, voiceRoomErrors } from './common.js';

export const meta = { tags: ['voice-rooms'], requireCredential: true, kind: 'write:account', errors: voiceRoomErrors } as const;
export const paramDef = { type: 'object', properties: { roomId: { type: 'string', format: 'misskey:id' } }, required: ['roomId'] } as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(private voiceRoomService: VoiceRoomService, private voiceRoomMediaService: VoiceRoomMediaService, private globalEventService: GlobalEventService) {
		super(meta, paramDef, async (ps, me) => {
			try {
				const result = await this.voiceRoomService.leave(ps.roomId, me.id);
				if (result === 'ended') {
					const room = await this.voiceRoomService.get(ps.roomId);
					this.globalEventService.publishVoiceRoomStream(ps.roomId, 'roomEnded', { endedAt: room!.endedAt!.toISOString() });
					await this.voiceRoomMediaService.closeRoom(ps.roomId);
				} else {
					this.voiceRoomMediaService.closeUser(ps.roomId, me.id);
					this.globalEventService.publishVoiceRoomStream(ps.roomId, 'participantChanged', { userId: me.id });
				}
			} catch (error) { throwVoiceRoomApiError(error); }
		});
	}
}
