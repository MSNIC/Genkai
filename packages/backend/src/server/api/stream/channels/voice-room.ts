/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { isJsonObject, type JsonObject, type JsonValue } from '@/misc/json-value.js';
import { bindThis } from '@/decorators.js';
import { VoiceRoomMediaService } from '@/core/VoiceRoomMediaService.js';
import Channel, { type ChannelRequest } from '../channel.js';

@Injectable({ scope: Scope.TRANSIENT })
export class VoiceRoomChannel extends Channel {
	public readonly chName = 'voiceRoom';
	public static shouldShare = false;
	public static requireCredential = true as const;
	public static kind = 'read:account';
	private roomId: string | null = null;

	constructor(
		@Inject(REQUEST)
		request: ChannelRequest,

		private voiceRoomMediaService: VoiceRoomMediaService,
	) {
		super(request);
	}

	@bindThis
	public async init(params: JsonObject): Promise<boolean> {
		if (this.user == null || typeof params.roomId !== 'string') return false;
		this.roomId = params.roomId;
		try {
			await this.voiceRoomMediaService.getRtpCapabilities(this.roomId, this.user.id);
		} catch {
			return false;
		}
		this.subscriber.on(`voiceRoomStream:${this.roomId}`, this.send);
		this.send('ready', null);
		return true;
	}

	@bindThis
	public onMessage(type: string, body: JsonValue): void {
		if (this.user == null || this.roomId == null || !isJsonObject(body) || typeof body.requestId !== 'string') return;
		void this.handleRequest(type, body.requestId, body);
	}

	@bindThis
	private async handleRequest(type: string, requestId: string, body: JsonObject): Promise<void> {
		try {
			let data: unknown;
			switch (type) {
				case 'getRtpCapabilities': data = await this.voiceRoomMediaService.getRtpCapabilities(this.roomId!, this.user!.id); break;
				case 'createTransport':
					if (body.direction !== 'send' && body.direction !== 'recv') return;
					data = await this.voiceRoomMediaService.createTransport(this.roomId!, this.user!.id, body.direction);
					break;
				case 'connectTransport':
					if (typeof body.transportId !== 'string' || !isJsonObject(body.dtlsParameters)) return;
					await this.voiceRoomMediaService.connectTransport(this.roomId!, this.user!.id, body.transportId, body.dtlsParameters as never);
					data = null;
					break;
				case 'produce':
					if (typeof body.transportId !== 'string' || !isJsonObject(body.rtpParameters)) return;
					data = await this.voiceRoomMediaService.produce(this.roomId!, this.user!.id, body.transportId, body.rtpParameters as never);
					break;
				case 'listProducers': data = this.voiceRoomMediaService.listProducers(this.roomId!, this.user!.id); break;
				case 'consume':
					if (typeof body.transportId !== 'string' || typeof body.producerId !== 'string' || !isJsonObject(body.rtpCapabilities)) return;
					data = await this.voiceRoomMediaService.consume(this.roomId!, this.user!.id, body.transportId, body.producerId, body.rtpCapabilities as never);
					break;
				case 'resumeConsumer':
					if (typeof body.consumerId !== 'string') return;
					await this.voiceRoomMediaService.resumeConsumer(this.roomId!, this.user!.id, body.consumerId);
					data = null;
					break;
				case 'setMuted':
					if (typeof body.muted !== 'boolean') return;
					await this.voiceRoomMediaService.setMuted(this.roomId!, this.user!.id, body.muted);
					data = null;
					break;
				default: return;
			}
			this.send('response', { requestId, ok: true, data } as unknown as JsonValue);
		} catch (error) {
			this.send('response', { requestId, ok: false, error: error instanceof Error ? error.message : 'VOICE_ROOM_MEDIA_ERROR' });
		}
	}

	@bindThis
	public dispose(): void {
		if (this.roomId != null) {
			this.subscriber.off(`voiceRoomStream:${this.roomId}`, this.send);
			if (this.user != null) this.voiceRoomMediaService.closeUser(this.roomId, this.user.id);
		}
	}
}
