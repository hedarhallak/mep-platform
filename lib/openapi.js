// lib/openapi.js — Phase 71 (May 2026, Section 22 hardening).
//
// Builds the OpenAPI 3.0 spec from JSDoc comments scattered across the
// route files. Mounted at /api-docs by app.js. The spec covers the
// public-facing schema (info, servers, security schemes, common
// responses) here; per-route definitions live next to their handlers
// as `@openapi` JSDoc blocks.
//
// Phase 71 is the SETUP — base config + a few proof-of-concept routes
// annotated. Phase 71b will fan out the @openapi blocks to the rest of
// the routes incrementally; the spec is forgiving of partial coverage
// so this can ship in tranches without breaking the docs UI.

'use strict';

const path = require('node:path');
const swaggerJsdoc = require('swagger-jsdoc');

const APP_NAME = process.env.APP_NAME || 'Constrai';

const definition = {
  openapi: '3.0.3',
  info: {
    title: `${APP_NAME} API`,
    version: '1.0.0',
    description:
      'REST API for the Constrai (MEP Platform) Quebec construction workforce ERP. ' +
      'Multi-tenant by `company_id`; most endpoints require a JWT Bearer token + a ' +
      'specific permission via `requirePermission(...)` middleware. See `API.md` for ' +
      'the full route reference and `DECISIONS.md` Section 1 for the role × permission matrix.',
    contact: {
      name: 'Hedar Hallak',
      email: 'hedar.hallak@gmail.com',
    },
  },
  servers: [
    {
      url: 'https://app.constrai.ca',
      description: 'Production',
    },
    {
      url: 'http://localhost:3000',
      description: 'Local dev',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'JWT access token (1h validity). Obtain via POST /api/auth/login. Refresh via POST /api/auth/refresh.',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          error: { type: 'string', example: 'INVALID_INPUT' },
          message: { type: 'string', example: 'human-readable detail' },
        },
        required: ['ok', 'error'],
      },
      OkResponse: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
        },
        required: ['ok'],
      },
    },
    responses: {
      Unauthorized: {
        description: 'Missing or invalid Bearer token',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { ok: false, error: 'UNAUTHORIZED' },
          },
        },
      },
      Forbidden: {
        description: 'Authenticated but missing required permission',
        content: {
          'application/json': {
            schema: {
              allOf: [
                { $ref: '#/components/schemas/ErrorResponse' },
                {
                  type: 'object',
                  properties: { permission: { type: 'string', example: 'projects.edit' } },
                },
              ],
            },
          },
        },
      },
      ValidationError: {
        description: 'Request body or query parameters failed validation',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
          },
        },
      },
    },
  },
  // Most endpoints sit behind JWT; per-route security overrides flag the
  // public ones (auth/login, onboarding/verify, health, etc.).
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Health', description: 'Liveness + readiness probes' },
    { name: 'Auth', description: 'Login / refresh / signup / activation' },
    { name: 'Onboarding', description: 'Worker invite verification + completion' },
    { name: 'Employees', description: 'Employee CRUD + profile management' },
    { name: 'Projects', description: 'Project lifecycle + foremen + trades' },
    { name: 'Assignments', description: 'Worker assignments + auto-assign' },
    { name: 'Attendance', description: 'Check-in / check-out / approvals' },
    { name: 'Materials', description: 'Material requests + purchase orders' },
    { name: 'Suppliers', description: 'Supplier directory' },
    { name: 'Reports', description: 'Hours / attendance / travel / distance' },
    { name: 'Permissions', description: 'RBAC introspection + grants' },
    { name: 'SuperAdmin', description: 'Cross-tenant SUPER_ADMIN operations' },
    { name: 'Hub', description: 'Tasks / messages inbox' },
    { name: 'Standup', description: 'Daily standup planning' },
    { name: 'Dispatch', description: 'Daily dispatch runs' },
  ],
};

const options = {
  definition,
  // Pull @openapi JSDoc blocks from app.js + every route handler.
  apis: [path.join(__dirname, '..', 'app.js'), path.join(__dirname, '..', 'routes', '*.js')],
};

const spec = swaggerJsdoc(options);

module.exports = { spec };
