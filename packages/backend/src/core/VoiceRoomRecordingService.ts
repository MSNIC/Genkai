/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createSocket } from 'node:dgram';
import { writeFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable } from '@nestjs/common';
import FFmpeg from 'fluent-ffmpeg';
import type { types as MediasoupTypes } from 'mediasoup';
import { DI } from '@/di-symbols.js';
import type { UsersRepository, VoiceRoomRecordingsRepository, VoiceRoomsRepository } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { createTempDir } from '@/misc/create-temp.js';
import { IdService } from '@/core/IdService.js';
import { DriveService } from '@/core/DriveService.js';

type RecordingTrack = {
	path: string;
	offsetMs: number;
	command: FFmpeg.FfmpegCommand;
	done: Promise<void>;
	consumer: MediasoupTypes.Consumer;
	transport: MediasoupTypes.PlainTransport;
};

type RecordingSession = {
	id: string;
	roomId: string;
	hostId: string;
	startedAt: number;
	dir: string;
	cleanup: () => void;
	tracks: Map<string, RecordingTrack>;
	setups: Set<Promise<void>>;
	closing: boolean;
};

@Injectable()
export class VoiceRoomRecordingService {
	private sessions = new Map<string, RecordingSession>();
	private sessionPromises = new Map<string, Promise<RecordingSession | null>>();

	constructor(
		@Inject(DI.voiceRoomsRepository)
		private voiceRoomsRepository: VoiceRoomsRepository,

		@Inject(DI.voiceRoomRecordingsRepository)
		private voiceRoomRecordingsRepository: VoiceRoomRecordingsRepository,

		@Inject(DI.usersRepository)
		private usersRepository: UsersRepository,

		private idService: IdService,
		private driveService: DriveService,
	) {
	}

	@bindThis
	private async getSession(roomId: string): Promise<RecordingSession | null> {
		const current = this.sessions.get(roomId);
		if (current != null) return current;
		let pending = this.sessionPromises.get(roomId);
		if (pending == null) {
			pending = (async () => {
				const room = await this.voiceRoomsRepository.findOneBy({ id: roomId });
				if (room == null || !room.recordingEnabled) return null;
				const [dir, cleanup] = await createTempDir();
				const createdAt = new Date();
				const recording = await this.voiceRoomRecordingsRepository.save({
					id: this.idService.gen(createdAt.getTime()), roomId, fileId: null, status: 'recording', createdAt, finishedAt: null, durationMs: null,
				});
				const session = { id: recording.id, roomId, hostId: room.hostId, startedAt: createdAt.getTime(), dir, cleanup, tracks: new Map(), setups: new Set<Promise<void>>(), closing: false };
				this.sessions.set(roomId, session);
				return session;
			})();
			this.sessionPromises.set(roomId, pending);
		}
		try {
			return await pending;
		} finally {
			this.sessionPromises.delete(roomId);
		}
	}

	@bindThis
	private async getFreeUdpPort(): Promise<number> {
		return await new Promise((resolve, reject) => {
			const socket = createSocket('udp4');
			socket.once('error', reject);
			socket.bind(0, '127.0.0.1', () => {
				const address = socket.address();
				socket.close(() => resolve(address.port));
			});
		});
	}

	@bindThis
	public async recordProducer(roomId: string, router: MediasoupTypes.Router, producer: MediasoupTypes.Producer): Promise<void> {
		const session = await this.getSession(roomId);
		if (session == null || session.closing || session.tracks.has(producer.id)) return;
		const setup = this.setupTrack(session, router, producer);
		session.setups.add(setup);
		try {
			await setup;
		} finally {
			session.setups.delete(setup);
		}
	}

	@bindThis
	private async setupTrack(session: RecordingSession, router: MediasoupTypes.Router, producer: MediasoupTypes.Producer): Promise<void> {
		const port = await this.getFreeUdpPort();
		const transport = await router.createPlainTransport({ listenInfo: { protocol: 'udp', ip: '127.0.0.1' }, rtcpMux: true, comedia: false });
		await transport.connect({ ip: '127.0.0.1', port });
		const consumer = await transport.consume({ producerId: producer.id, rtpCapabilities: router.rtpCapabilities, paused: true });
		const codec = consumer.rtpParameters.codecs[0];
		if (codec == null) throw new Error('Recording consumer has no codec');
		const outputPath = join(session.dir, `${producer.id}.ogg`);
		const sdpPath = join(session.dir, `${producer.id}.sdp`);
		const codecName = codec.mimeType.split('/')[1];
		const fmtp = Object.entries(codec.parameters ?? {}).map(([key, value]) => `${key}=${value}`).join(';');
		await writeFile(sdpPath, [
			'v=0', 'o=- 0 0 IN IP4 127.0.0.1', 's=Voice Room Recording', 'c=IN IP4 127.0.0.1', 't=0 0',
			`m=audio ${port} RTP/AVP ${codec.payloadType}`,
			`a=rtpmap:${codec.payloadType} ${codecName}/${codec.clockRate}/${codec.channels ?? 1}`,
			...(fmtp === '' ? [] : [`a=fmtp:${codec.payloadType} ${fmtp}`]),
			'a=recvonly', '',
		].join('\r\n'));

		const command = FFmpeg(sdpPath)
			.inputOptions(['-protocol_whitelist file,udp,rtp', '-fflags +genpts'])
			.noVideo()
			.audioCodec('libopus')
			.format('ogg')
			.output(outputPath);
		const done = new Promise<void>((resolve, reject) => {
			command.once('start', () => void consumer.resume()).once('end', resolve).once('error', reject);
		});
		const track = { path: outputPath, offsetMs: Date.now() - session.startedAt, command, done, consumer, transport };
		session.tracks.set(producer.id, track);
		producer.observer.once('close', () => this.stopTrack(track));
		command.run();
	}

	@bindThis
	private stopTrack(track: RecordingTrack): void {
		if (!track.consumer.closed) track.consumer.close();
		if (!track.transport.closed) track.transport.close();
		try { track.command.kill('SIGINT'); } catch { /* FFmpeg may already have exited. */ }
	}

	@bindThis
	private async mixTracks(session: RecordingSession, tracks: RecordingTrack[]): Promise<string> {
		if (tracks.length === 1 && tracks[0]!.offsetMs === 0) return tracks[0]!.path;
		const outputPath = join(session.dir, 'voice-room-recording.ogg');
		const command = FFmpeg();
		for (const track of tracks) command.input(track.path);
		const delayed = tracks.map((track, index) => `[${index}:a]adelay=${track.offsetMs}|${track.offsetMs}[a${index}]`);
		const labels = tracks.map((_, index) => `[a${index}]`).join('');
		command.complexFilter(`${delayed.join(';')};${labels}amix=inputs=${tracks.length}:duration=longest:normalize=0[mix]`);
		command.outputOptions(['-map [mix]']).audioCodec('libopus').format('ogg').output(outputPath);
		await new Promise<void>((resolve, reject) => command.once('end', resolve).once('error', reject).run());
		return outputPath;
	}

	@bindThis
	public async finish(roomId: string): Promise<void> {
		const pending = this.sessionPromises.get(roomId);
		const session = this.sessions.get(roomId) ?? (pending == null ? null : await pending);
		if (session == null) return;
		session.closing = true;
		this.sessions.delete(roomId);
		await this.voiceRoomRecordingsRepository.update(session.id, { status: 'processing' });
		try {
			await Promise.allSettled([...session.setups]);
			for (const track of session.tracks.values()) this.stopTrack(track);
			await Promise.allSettled([...session.tracks.values()].map(track => track.done));
			const tracks: RecordingTrack[] = [];
			for (const track of session.tracks.values()) {
				if (await stat(track.path).then(file => file.size > 0).catch(() => false)) tracks.push(track);
			}
			if (tracks.length === 0) throw new Error('No audio was recorded');
			const outputPath = await this.mixTracks(session, tracks);
			const host = await this.usersRepository.findOneByOrFail({ id: session.hostId });
			const file = await this.driveService.addFile({ user: host, path: outputPath, name: `space-${roomId}.ogg`, force: true, ext: 'ogg' });
			const finishedAt = new Date();
			await this.voiceRoomRecordingsRepository.update(session.id, { fileId: file.id, status: 'ready', finishedAt, durationMs: finishedAt.getTime() - session.startedAt });
		} catch {
			await this.voiceRoomRecordingsRepository.update(session.id, { status: 'failed', finishedAt: new Date() });
		} finally {
			session.cleanup();
		}
	}
}
