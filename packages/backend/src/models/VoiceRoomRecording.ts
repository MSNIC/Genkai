/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiDriveFile } from './DriveFile.js';
import { MiVoiceRoom } from './VoiceRoom.js';

export type VoiceRoomRecordingStatus = 'recording' | 'processing' | 'ready' | 'failed';

@Entity('voice_room_recording')
export class MiVoiceRoomRecording {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_voice_room_recording_roomId')
	@Column({ ...id() })
	public roomId: MiVoiceRoom['id'];

	@ManyToOne(() => MiVoiceRoom, { onDelete: 'CASCADE' })
	@JoinColumn()
	public room: MiVoiceRoom | null;

	@Column({ ...id(), nullable: true })
	public fileId: MiDriveFile['id'] | null;

	@ManyToOne(() => MiDriveFile, { onDelete: 'SET NULL' })
	@JoinColumn()
	public file: MiDriveFile | null;

	@Column('enum', {
		enum: ['recording', 'processing', 'ready', 'failed'],
		default: 'recording',
	})
	public status: VoiceRoomRecordingStatus;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone', { nullable: true })
	public finishedAt: Date | null;

	@Column('integer', { nullable: true })
	public durationMs: number | null;
}
