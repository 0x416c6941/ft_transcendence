/**
 * Swagger/OpenAPI Configuration
 */

import { FastifyInstance } from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUI from '@fastify/swagger-ui';
import type { SwaggerOptions } from '@fastify/swagger';
import { BASE_URL } from '../app.config.js';

export const swaggerConfig: SwaggerOptions = {
	openapi: {
		openapi: '3.0.0',
		info: {
			title: 'ft_transcendence API',
			description: 'API documentation for the ft_transcendence web application',
			version: '1.0.0'
		},
		servers: [
			{
				url: BASE_URL,
				description: 'Development server'
			}
		],
		tags: [
			{ name: 'users', description: 'User management endpoints' },
			{ name: 'auth', description: 'Authentication endpoints' },
			{ name: 'games', description: 'Game statistics and records endpoints' },
			{ name: 'tournaments', description: 'Tournament records and statistics endpoints' }
		],
		components: {
			securitySchemes: {
				cookieAuth: {
					type: 'apiKey' as const,
					in: 'cookie' as const,
					name: 'accessToken',
					description:
						'Authentication via HttpOnly cookie "accessToken". Obtain it by POST /api/users/login. ' +
							'Tokens are rotated via POST /api/users/refresh and cleared via POST /api/users/logout.'
				}
			}
		}
	}
};

export const swaggerUIConfig = {
	routePrefix: '/api/docs',
	uiConfig: {
		docExpansion: 'list' as const,
		deepLinking: false
	},
	staticCSP: true,
	transformStaticCSP: (header: string) => {
		// Modify CSP to allow inline styles and scripts for Swagger UI
		return header
			.replace("style-src 'self' https:", "style-src 'self' https: 'unsafe-inline'")
			.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'");
	}
};

/**
 * Register Swagger plugins with Fastify instance
 */
export async function registerSwagger(fastify: FastifyInstance) {
	await fastify.register(swagger, swaggerConfig);
	await fastify.register(swaggerUI, swaggerUIConfig);
}
