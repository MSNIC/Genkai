/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiVoiceRoom } from './VoiceRoom.js';

export type VoiceRoomParticipantRole = 'host' | 'cohost' | 'speaker' | 'listener';

@Entity('voice_room_participant')
@Index('IDX_voice_room_participant_room_user', ['roomId', 'userId'], { unique: true })
export class MiVoiceRoomParticipant {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_voice_room_participant_roomId')
	@Column({ ...id() })
	public roomId: MiVoiceRoom['id'];

	@ManyToOne(() => MiVoiceRoom, { onDelete: 'CASCADE' })
	@JoinColumn()
	public room: MiVoiceRoom | null;

	@Index('IDX_voice_room_participant_userId')
	@Column({ ...id() })
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn()
	public user: MiUser | null;

	@Column('enum', {
		enum: ['host', 'cohost', 'speaker', 'listener'],
	})
	public role: VoiceRoomParticipantRole;

	@Column('timestamp with time zone')
	public joinedAt: Date;

	@Column('timestamp with time zone', { nullable: true })
	public leftAt: Date | null;

	@Column('boolean', { default: true })
	public isMuted: boolean;
}
