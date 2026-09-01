/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable, OnApplicationShutdown } from '@nestjs/common';
import * as Redis from 'ioredis';
import WebSocket from 'ws';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { bindThis } from '@/decorators.js';
import { LoggerService } from '@/core/LoggerService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';

export interface EEWData {
	code: number;
	time: string;
	areas: Array<{
		name: string;
		scaleFrom: string;
		scaleTo: string;
		arrivalTime: string;
	}>;
	issue: {
		time: string;
		type: string;
		serial: number;
	};
	earthquake: {
		time: string;
		hypocenter: {
			name: string;
			latitude: number;
			longitude: number;
			depth: number;
			magnitude: number;
		};
	};
	cancelled?: boolean;
}

export interface JMAQuakeData {
	code: number;
	time: string;
	issue: {
		time: string;
		type: string;
		source: string;
	};
	earthquake: {
		time: string;
		hypocenter: {
			name: string;
			latitude?: number;
			longitude?: number;
			depth?: number;
			magnitude?: number;
		};
		maxScale: number;
		domesticTsunami?: string;
	};
	points?: Array<{
		pref: string;
		addr: string;
		scale: number;
	}>;
}

@Injectable()
export class EarthquakeService implements OnApplicationShutdown {
	private ws: WebSocket | null = null;
	private reconnectTimer: NodeJS.Timeout | null = null;
	private reconnectAttempts = 0;
	private readonly maxReconnectAttempts = 10;
	private readonly reconnectDelay = 5000; // 5秒
	private readonly rateLimitDelay = 300000; // 5分（429エラー時）
	private readonly wsEndpoint = 'wss://api.p2pquake.net/v2/ws';
	private logger: any;
	private isRateLimited = false;
	private isWorker = false;

	constructor(
		@Inject(DI.config)
		private config: Config,

		@Inject(DI.redisForSub)
		private redisForSub: Redis.Redis,

		private loggerService: LoggerService,
		private globalEventService: GlobalEventService,
	) {
		this.logger = this.loggerService.getLogger('earthquake', 'cyan');
		// ワーカープロセスかどうかを判定（環境変数やプロセス情報から）
		this.isWorker = process.env.WORKER_ID !== undefined;

		// メインプロセスのみ接続（レート制限対策）
		if (!this.isWorker) {
			this.connect();
		} else {
			this.logger.info('Skipping WebSocket connection in worker process (rate limit protection)');
		}
	}

	@bindThis
	private connect(): void {
		if (this.ws) {
			return;
		}

		this.logger.info('Connecting to P2P地震情報 WebSocket API...');

		this.ws = new WebSocket(this.wsEndpoint);

		this.ws.on('open', () => {
			this.logger.succ('Connected to P2P地震情報 WebSocket API');
			this.reconnectAttempts = 0;
		});

		this.ws.on('message', (data: WebSocket.Data) => {
			try {
				const message = JSON.parse(data.toString());
				this.handleMessage(message);
			} catch (error) {
				this.logger.error('Failed to parse WebSocket message', error);
			}
		});

		this.ws.on('error', (error) => {
			this.logger.error('WebSocket error', error);
			// 429エラー（レート制限）の検出
			if (error.message && error.message.includes('429')) {
				this.isRateLimited = true;
				this.logger.warn('Rate limit detected (429). Will retry after longer delay.');
			}
		});

		this.ws.on('close', () => {
			this.logger.warn('WebSocket connection closed');
			this.ws = null;
			this.scheduleReconnect();
		});
	}

	@bindThis
	private handleMessage(message: any): void {
		// 情報コード: 554 = 緊急地震速報(予報), 556 = 緊急地震速報(警報)
		// 情報コード: 551 = 地震感知情報, 552 = 地震情報
		const { code } = message;

		if (code === 554 || code === 556) {
			// 緊急地震速報
			this.logger.info(`EEW received: code=${code}`);
			this.broadcastEEW(message);
		} else if (code === 551 || code === 552) {
			// 地震情報
			this.logger.info(`Earthquake info received: code=${code}`);
			this.broadcastQuakeInfo(message);
		}
	}

	@bindThis
	private broadcastEEW(data: EEWData): void {
		// GlobalEventService経由でフロントエンドにブロードキャスト
		this.globalEventService.publishBroadcastStream('eew', { data });
	}

	@bindThis
	private broadcastQuakeInfo(data: JMAQuakeData): void {
		// GlobalEventService経由でフロントエンドにブロードキャスト
		this.globalEventService.publishBroadcastStream('quakeInfo', { data });
	}

	@bindThis
	private scheduleReconnect(): void {
		if (this.reconnectTimer) {
			return;
		}

		if (this.reconnectAttempts >= this.maxReconnectAttempts) {
			this.logger.error('Max reconnect attempts reached. Giving up.');
			return;
		}

		this.reconnectAttempts++;

		// レート制限の場合は長い遅延を使用
		let delay: number;
		if (this.isRateLimited) {
			delay = this.rateLimitDelay;
			this.logger.warn(`Rate limited. Scheduling reconnect in ${delay / 1000}s (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
			this.isRateLimited = false; // リセット
		} else {
			delay = this.reconnectDelay * this.reconnectAttempts;
			this.logger.info(`Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
		}

		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null;
			this.connect();
		}, delay);
	}

	@bindThis
	public async onApplicationShutdown(signal: string): Promise<void> {
		this.logger.info('Shutting down EarthquakeService...');

		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer);
			this.reconnectTimer = null;
		}

		if (this.ws) {
			this.ws.close();
			this.ws = null;
		}
	}
}
