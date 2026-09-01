/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';

export const meta = {
	tags: ['eew'],

	requireCredential: true,

	kind: 'write:account',

	limit: {
		duration: 1000 * 60,
		max: 5,
	},

	res: {
		type: 'object',
		properties: {
			success: {
				type: 'boolean',
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		private globalEventService: GlobalEventService,
	) {
		super(meta, paramDef, async (ps, user) => {
			// テスト用のEEWデータを送信
			const testEEWData = {
				code: 556,
				time: new Date().toISOString(),
				areas: [
					{
						name: '東京都23区',
						scaleFrom: '5弱',
						scaleTo: '5強',
						arrivalTime: new Date(Date.now() + 30000).toISOString(),
					},
					{
						name: '神奈川県東部',
						scaleFrom: '4',
						scaleTo: '5弱',
						arrivalTime: new Date(Date.now() + 35000).toISOString(),
					},
				],
				issue: {
					time: new Date().toISOString(),
					type: 'Final',
					serial: 1,
				},
				earthquake: {
					time: new Date().toISOString(),
					hypocenter: {
						name: '東京湾',
						latitude: 35.5,
						longitude: 139.8,
						depth: 30,
						magnitude: 6.2,
					},
				},
			};

			console.log('[EEW Test Endpoint] Broadcasting test EEW data');
			this.globalEventService.publishBroadcastStream('eew', { data: testEEWData });
			console.log('[EEW Test Endpoint] Test EEW broadcast completed');

			return { success: true };
		});
	}
}
