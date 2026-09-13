/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

export type VoiceRoomStatus = 'scheduled' | 'live' | 'ended';

@Entity('voice_room')
export class MiVoiceRoom {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_voice_room_hostId')
	@Column({ ...id() })
	public hostId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn()
	public host: MiUser | null;

	@Column('varchar', { length: 256 })
	public title: string;

	@Column('varchar', { length: 2048, default: '' })
	public description: string;

	@Index('IDX_voice_room_status')
	@Column('enum', {
		enum: ['scheduled', 'live', 'ended'],
		default: 'scheduled',
	})
	public status: VoiceRoomStatus;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Index('IDX_voice_room_scheduledAt')
	@Column('timestamp with time zone', { nullable: true })
	public scheduledAt: Date | null;

	@Column('timestamp with time zone', { nullable: true })
	public startedAt: Date | null;

	@Column('timestamp with time zone', { nullable: true })
	public endedAt: Date | null;

	@Column('smallint', { default: 6 })
	public maxSpeakers: number;

	@Column('smallint', { default: 100 })
	public maxListeners: number;

	@Column('boolean', { default: false })
	public recordingEnabled: boolean;
}
