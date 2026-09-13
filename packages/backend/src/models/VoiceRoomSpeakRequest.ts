/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiVoiceRoom } from './VoiceRoom.js';

export type VoiceRoomSpeakRequestStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn';

@Entity('voice_room_speak_request')
@Index('IDX_voice_room_speak_request_pending', ['roomId', 'userId'], {
	unique: true,
	where: '"status" = \'pending\'',
})
export class MiVoiceRoomSpeakRequest {
	@PrimaryColumn(id())
	public id: string;

	@Index('IDX_voice_room_speak_request_roomId')
	@Column({ ...id() })
	public roomId: MiVoiceRoom['id'];

	@ManyToOne(() => MiVoiceRoom, { onDelete: 'CASCADE' })
	@JoinColumn()
	public room: MiVoiceRoom | null;

	@Index('IDX_voice_room_speak_request_userId')
	@Column({ ...id() })
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, { onDelete: 'CASCADE' })
	@JoinColumn()
	public user: MiUser | null;

	@Column('enum', {
		enum: ['pending', 'accepted', 'rejected', 'withdrawn'],
		default: 'pending',
	})
	public status: VoiceRoomSpeakRequestStatus;

	@Column('timestamp with time zone')
	public createdAt: Date;

	@Column('timestamp with time zone', { nullable: true })
	public respondedAt: Date | null;

	@Column({ ...id(), nullable: true })
	public respondedById: MiUser['id'] | null;
}
